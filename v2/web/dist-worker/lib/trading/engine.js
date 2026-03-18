"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTraderEngine = getTraderEngine;
exports.getParallelTraderEngines = getParallelTraderEngines;
exports.runTraderCycle = runTraderCycle;
exports.runTraderCycles = runTraderCycles;
exports.listTraderPositions = listTraderPositions;
exports.listTraderPositionsByRunner = listTraderPositionsByRunner;
exports.getTraderReadiness = getTraderReadiness;
exports.getTraderReadinessByRunner = getTraderReadinessByRunner;
exports.getTraderPerformance = getTraderPerformance;
exports.getTraderPerformanceByRunner = getTraderPerformanceByRunner;
exports.redactedConfigSummary = redactedConfigSummary;
const node_crypto_1 = require("node:crypto");
const viem_1 = require("viem");
const abi_1 = require("./abi");
const clients_1 = require("./clients");
const config_1 = require("./config");
const hyperliquid_1 = require("./hyperliquid");
const market_1 = require("./market");
const position_store_1 = require("./position-store");
const scanner_client_1 = require("./scanner-client");
const signals_1 = require("./signals");
const swap_1 = require("./swap");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function computeHyperliquidMinOrderNotionalUsd(priceUsd, szDecimals) {
    if (!Number.isFinite(priceUsd) || priceUsd <= 0)
        return Number.POSITIVE_INFINITY;
    const lotStep = 10 ** -Math.max(0, szDecimals);
    const minLots = Math.ceil(10 / (priceUsd * lotStep));
    return minLots * lotStep * priceUsd;
}
function decimalStringToRaw(value, decimals) {
    const normalized = value.trim();
    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        return "0";
    }
    const [whole, fractional = ""] = normalized.split(".");
    const units = `${whole}${fractional.padEnd(Math.max(0, decimals), "0").slice(0, Math.max(0, decimals))}`
        .replace(/^0+/, "");
    return units.length > 0 ? units : "0";
}
function isSpotVenue(venue) {
    return venue === "base-spot" || venue === "ethereum-spot";
}
function dexScreenerChainForVenue(venue) {
    return venue === "ethereum-spot" ? "ethereum" : "base";
}
class TraderEngine {
    config;
    store;
    clients;
    initPromise;
    constructor(config) {
        this.config = config;
        this.clients = (0, clients_1.createTraderClients)(config);
        this.store = new position_store_1.PositionStore(config.positionStorePath);
        this.initPromise = this.store.load();
    }
    async runCycle() {
        await this.initPromise;
        const startedAt = Date.now();
        const report = {
            startedAt,
            finishedAt: startedAt,
            dryRun: this.config.dryRun,
            executionVenue: this.config.executionVenue,
            scannerCandidates: 0,
            openPositions: this.store.getOpen().length,
            entries: [],
            exits: [],
            skipped: [],
            errors: [],
        };
        report.openPositions = await this.getCurrentOpenPositionCount();
        const readiness = await this.getReadiness();
        report.readiness = readiness;
        if (!this.config.dryRun && !readiness.liveReady) {
            report.errors.push(`live-gate:${readiness.reasons.join(",")}`);
            report.finishedAt = Date.now();
            return report;
        }
        await this.evaluateOpenPositions(report);
        let marketSignals = [];
        if (this.config.executionVenue === "hyperliquid-perp") {
            try {
                marketSignals = await (0, signals_1.getAggregatedMarketSignals)({
                    limit: 250,
                    minAbsScore: 0.2,
                });
            }
            catch (error) {
                report.errors.push(`signals:${error instanceof Error ? error.message : "signal aggregation failed"}`);
            }
        }
        let candidates = [];
        try {
            candidates = await (0, scanner_client_1.fetchScannerCandidates)(this.config);
        }
        catch (error) {
            report.errors.push(error instanceof Error ? error.message : "scanner fetch failed");
            report.finishedAt = Date.now();
            return report;
        }
        report.scannerCandidates = candidates.length;
        let entries = 0;
        for (const candidate of candidates) {
            if (entries >= this.config.risk.maxNewEntriesPerCycle)
                break;
            if (this.store.getByToken(candidate.tokenAddress)) {
                report.skipped.push(`already-open:${candidate.tokenAddress}`);
                continue;
            }
            try {
                const opened = await this.tryOpenPosition(candidate, marketSignals);
                if (!opened)
                    continue;
                report.entries.push(opened);
                entries += 1;
            }
            catch (error) {
                report.errors.push(`entry:${candidate.tokenAddress}:${error instanceof Error ? error.message : "unknown error"}`);
            }
        }
        report.openPositions = await this.getCurrentOpenPositionCount();
        report.finishedAt = Date.now();
        return report;
    }
    async listPositions() {
        await this.initPromise;
        if (this.config.executionVenue !== "hyperliquid-perp" || this.config.dryRun) {
            return this.store.getAll();
        }
        const liveOpen = await this.getHyperliquidOpenPositionsFromVenue();
        const closed = this.store.getAll().filter((position) => position.status === "closed");
        return [...liveOpen, ...closed];
    }
    async getHyperliquidOpenPositionsFromVenue() {
        const accountAddress = (0, hyperliquid_1.resolveHyperliquidAccountAddress)(this.config, this.clients.address);
        const livePositions = await (0, hyperliquid_1.fetchHyperliquidLivePositions)(this.config, accountAddress);
        const quoteTokenAddress = this.config.quoteTokens.USDC ?? ZERO_ADDRESS;
        const quoteTokenDecimals = this.config.quoteTokenDecimals.USDC ?? 6;
        const liveIds = new Set();
        const positions = [];
        for (const live of livePositions) {
            const id = `hl:${live.symbol}:${live.marketId ?? "unknown"}`;
            liveIds.add(id);
            const quantityRaw = decimalStringToRaw(live.size, live.szDecimals);
            const sizeNumeric = Number(live.size);
            const entryNotionalUsd = Number.isFinite(sizeNumeric) ? sizeNumeric * live.entryPriceUsd : live.positionValueUsd;
            const quoteSpentRaw = Math.max(1, Math.floor(entryNotionalUsd * 10 ** quoteTokenDecimals)).toString();
            // Merge with existing store data to preserve openedAt, signalSource, etc.
            const existing = this.store.getAll().find((p) => p.id === id && p.status === "open");
            const position = {
                id,
                venue: "hyperliquid-perp",
                tokenAddress: quoteTokenAddress,
                tokenDecimals: live.szDecimals,
                quoteTokenAddress,
                quoteSymbol: "USD",
                quoteTokenDecimals,
                dex: "uniswap-v3",
                marketSymbol: live.symbol,
                marketId: live.marketId ?? undefined,
                leverage: live.leverage ?? this.config.hyperliquid.defaultLeverage,
                poolAddress: undefined,
                entryPriceUsd: live.entryPriceUsd,
                quantityTokenRaw: quantityRaw,
                quoteSpentRaw,
                entryNotionalUsd,
                stopLossPct: this.config.risk.stopLossPct,
                takeProfitPct: this.config.risk.takeProfitPct,
                openedAt: existing?.openedAt ?? Date.now(),
                txHash: existing?.txHash,
                status: "open",
                direction: live.isShort ? "short" : "long",
                trailingStopPct: this.config.risk.trailingStopPct,
                signalSource: existing?.signalSource,
                signalConfidence: existing?.signalConfidence,
                kellyFraction: existing?.kellyFraction,
                highWaterMark: existing?.highWaterMark,
                lowWaterMark: existing?.lowWaterMark,
            };
            // Persist to store (→ Redis) so positions survive cold starts
            await this.store.upsert(position);
            positions.push(position);
        }
        // Detect positions that disappeared from HL (closed externally / liquidated)
        const storeOpen = this.store.getOpen().filter((p) => p.venue === "hyperliquid-perp");
        for (const stored of storeOpen) {
            if (!liveIds.has(stored.id)) {
                // Position gone from HL — mark as closed
                await this.store.close(stored.id, {
                    exitReason: "manual",
                    exitPriceUsd: stored.entryPriceUsd, // best guess — true exit price unknown
                    closedAt: Date.now(),
                });
            }
        }
        return positions;
    }
    async getCurrentOpenPositionCount() {
        if (this.config.executionVenue !== "hyperliquid-perp" || this.config.dryRun) {
            return this.store.getOpen().length;
        }
        try {
            return (await this.getHyperliquidOpenPositionsFromVenue()).length;
        }
        catch {
            return this.store.getOpen().length;
        }
    }
    async getPerformance() {
        await this.initPromise;
        const persistedPositions = this.store.getAll();
        const openPositions = this.config.executionVenue === "hyperliquid-perp" && !this.config.dryRun
            ? await this.getHyperliquidOpenPositionsFromVenue()
            : persistedPositions.filter((position) => position.status === "open");
        const closedPositions = persistedPositions.filter((position) => position.status === "closed");
        const open = [];
        const closed = [];
        let deployedUsd = 0;
        let openMarketValueUsd = 0;
        let unrealizedPnlUsd = 0;
        let realizedPnlUsd = 0;
        for (const position of openPositions) {
            deployedUsd += position.entryNotionalUsd;
            const currentPriceUsd = await this.resolvePositionPriceUsd(position);
            if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || position.entryPriceUsd <= 0) {
                open.push({
                    position,
                    currentPriceUsd: null,
                    marketValueUsd: null,
                    unrealizedPnlUsd: null,
                    unrealizedPnlPct: null,
                });
                continue;
            }
            const marketValueUsd = position.entryNotionalUsd * (currentPriceUsd / position.entryPriceUsd);
            const pnlUsd = marketValueUsd - position.entryNotionalUsd;
            const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;
            openMarketValueUsd += marketValueUsd;
            unrealizedPnlUsd += pnlUsd;
            open.push({
                position,
                currentPriceUsd,
                marketValueUsd,
                unrealizedPnlUsd: pnlUsd,
                unrealizedPnlPct: pnlPct,
            });
        }
        for (const position of closedPositions) {
            if (!position.exitPriceUsd || !Number.isFinite(position.exitPriceUsd) || position.entryPriceUsd <= 0) {
                closed.push({
                    position,
                    realizedPnlUsd: null,
                    realizedPnlPct: null,
                });
                continue;
            }
            const pnlUsd = position.entryNotionalUsd * ((position.exitPriceUsd - position.entryPriceUsd) / position.entryPriceUsd);
            const pnlPct = position.entryNotionalUsd > 0 ? pnlUsd / position.entryNotionalUsd : 0;
            realizedPnlUsd += pnlUsd;
            closed.push({
                position,
                realizedPnlUsd: pnlUsd,
                realizedPnlPct: pnlPct,
            });
        }
        const grossPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
        const performanceFeeUsd = realizedPnlUsd > 0 ? (realizedPnlUsd * this.config.performanceFeeBps) / 10_000 : 0;
        const netPnlAfterFeeUsd = grossPnlUsd - performanceFeeUsd;
        const totals = {
            openPositions: openPositions.length,
            closedPositions: closedPositions.length,
            deployedUsd,
            openMarketValueUsd,
            unrealizedPnlUsd,
            realizedPnlUsd,
            grossPnlUsd,
            performanceFeeUsd,
            netPnlAfterFeeUsd,
        };
        return {
            timestamp: Date.now(),
            executionVenue: this.config.executionVenue,
            dryRun: this.config.dryRun,
            account: this.clients.address,
            fundingAddress: this.clients.address,
            performanceFeeBps: this.config.performanceFeeBps,
            readiness: await this.getReadiness(),
            totals,
            open,
            closed,
        };
    }
    async getReadiness() {
        await this.initPromise;
        const reasons = [];
        let scannerCandidates = 0;
        let scannerFetchError;
        try {
            scannerCandidates = (await (0, scanner_client_1.fetchScannerCandidates)(this.config)).length;
        }
        catch (error) {
            scannerFetchError = error instanceof Error ? error.message : "scanner fetch failed";
            reasons.push("scanner_unavailable");
        }
        if (scannerCandidates < this.config.safety.minScannerCandidatesLive) {
            reasons.push(`scanner_candidates_lt_${this.config.safety.minScannerCandidatesLive}`);
        }
        const balances = [];
        if (isSpotVenue(this.config.executionVenue)) {
            const nativeBalance = await this.clients.publicClient.getBalance({
                address: this.clients.address,
            });
            const nativeFormatted = (0, viem_1.formatUnits)(nativeBalance, 18);
            const nativeMeets = Number(nativeFormatted) >= this.config.safety.minBaseEthForGas;
            balances.push({
                symbol: "ETH",
                address: "native",
                raw: nativeBalance.toString(),
                decimals: 18,
                formatted: nativeFormatted,
                requiredFormatted: this.config.safety.minBaseEthForGas.toString(),
                meetsRequirement: nativeMeets,
            });
            if (!nativeMeets) {
                reasons.push(`eth_balance_lt_${this.config.safety.minBaseEthForGas}`);
            }
            for (const [symbol, tokenAddress] of Object.entries(this.config.quoteTokens)) {
                const decimals = this.config.quoteTokenDecimals[symbol] ?? 18;
                const requiredRaw = this.config.entryBudgetRaw[symbol] ?? BigInt(0);
                const requiredFormatted = (0, viem_1.formatUnits)(requiredRaw, decimals);
                let raw = BigInt(0);
                try {
                    raw = await this.clients.publicClient.readContract({
                        address: tokenAddress,
                        abi: abi_1.ERC20_TRADE_ABI,
                        functionName: "balanceOf",
                        args: [this.clients.address],
                    });
                }
                catch {
                    reasons.push(`${symbol.toLowerCase()}_balance_unreadable`);
                }
                const formatted = (0, viem_1.formatUnits)(raw, decimals);
                const meetsRequirement = raw >= requiredRaw;
                balances.push({
                    symbol,
                    address: tokenAddress,
                    raw: raw.toString(),
                    decimals,
                    formatted,
                    requiredRaw: requiredRaw.toString(),
                    requiredFormatted,
                    meetsRequirement,
                });
                if (!meetsRequirement) {
                    reasons.push(`${symbol.toLowerCase()}_balance_lt_entry_budget`);
                }
            }
        }
        else {
            const accountAddress = (0, hyperliquid_1.resolveHyperliquidAccountAddress)(this.config, this.clients.address);
            const defaultMarket = this.config.hyperliquid.defaultMarket;
            let accountValueUsd = null;
            let marketAvailable = false;
            try {
                const market = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.config, defaultMarket);
                marketAvailable = market !== null;
            }
            catch {
                reasons.push("hyperliquid_unreachable");
            }
            try {
                accountValueUsd = await (0, hyperliquid_1.fetchHyperliquidAccountValueUsd)(this.config, accountAddress);
            }
            catch {
                if (!this.config.dryRun) {
                    reasons.push("hyperliquid_account_unavailable");
                }
            }
            balances.push({
                symbol: "HL_ACCOUNT_VALUE_USD",
                address: accountAddress,
                raw: accountValueUsd !== null && Number.isFinite(accountValueUsd)
                    ? Math.floor(accountValueUsd * 100).toString()
                    : "0",
                decimals: 2,
                formatted: accountValueUsd !== null ? accountValueUsd.toFixed(2) : "0.00",
                requiredFormatted: this.config.hyperliquid.minAccountValueUsd.toString(),
                meetsRequirement: this.config.dryRun ||
                    (accountValueUsd !== null && accountValueUsd >= this.config.hyperliquid.minAccountValueUsd),
            });
            if (!marketAvailable && !this.config.dryRun) {
                reasons.push(`hyperliquid_market_unavailable_${defaultMarket.toLowerCase()}`);
            }
            if (!this.config.dryRun &&
                (accountValueUsd === null || accountValueUsd < this.config.hyperliquid.minAccountValueUsd)) {
                reasons.push(`hyperliquid_account_value_lt_${this.config.hyperliquid.minAccountValueUsd}`);
            }
        }
        return {
            timestamp: Date.now(),
            executionVenue: this.config.executionVenue,
            dryRun: this.config.dryRun,
            account: this.clients.address,
            scannerCandidates,
            scannerFetchError,
            minScannerCandidatesLive: this.config.safety.minScannerCandidatesLive,
            balances,
            liveReady: reasons.length === 0,
            reasons,
        };
    }
    async evaluateOpenPositions(report) {
        const open = this.store.getOpen();
        if (open.length === 0)
            return;
        for (const position of open) {
            // Skip scalper-managed positions (they have their own SL/TP via WebSocket)
            if (position.id.startsWith("scalp:"))
                continue;
            try {
                const currentPriceUsd = await this.resolvePositionPriceUsd(position);
                if (!currentPriceUsd || !Number.isFinite(currentPriceUsd) || currentPriceUsd <= 0) {
                    report.skipped.push(`exit:no-price:${position.tokenAddress}`);
                    continue;
                }
                const stopPrice = position.entryPriceUsd * (1 - position.stopLossPct);
                const takePrice = position.entryPriceUsd * (1 + position.takeProfitPct);
                let reason = null;
                if (currentPriceUsd <= stopPrice)
                    reason = "stop-loss";
                if (currentPriceUsd >= takePrice)
                    reason = "take-profit";
                if (!reason)
                    continue;
                const closed = await this.closePosition(position, reason, currentPriceUsd);
                if (closed) {
                    report.exits.push(closed);
                }
            }
            catch (error) {
                report.errors.push(`exit:${position.tokenAddress}:${error instanceof Error ? error.message : "unknown error"}`);
            }
        }
    }
    async resolvePositionPriceUsd(position) {
        if (position.venue === "hyperliquid-perp" && position.marketSymbol) {
            const market = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.config, position.marketSymbol);
            return market?.priceUsd ?? null;
        }
        const market = await (0, market_1.fetchTokenMarketSnapshot)(position.tokenAddress, {
            chainId: dexScreenerChainForVenue(position.venue ?? this.config.executionVenue),
        });
        return market.priceUsd;
    }
    async closePosition(position, reason, exitPriceUsd) {
        if (position.venue === "hyperliquid-perp") {
            return this.closeHyperliquidPosition(position, reason, exitPriceUsd);
        }
        if (this.config.dryRun) {
            return this.store.close(position.id, {
                exitReason: reason,
                exitPriceUsd,
                exitTxHash: syntheticHash(),
            });
        }
        const quoteMarket = await (0, market_1.fetchTokenMarketSnapshot)(position.quoteTokenAddress, {
            chainId: dexScreenerChainForVenue(position.venue ?? this.config.executionVenue),
        });
        if (!quoteMarket.priceUsd) {
            throw new Error(`missing quote price for exit ${position.quoteTokenAddress}`);
        }
        const amountIn = BigInt(position.quantityTokenRaw);
        if (amountIn <= BigInt(0)) {
            throw new Error("position amount is zero");
        }
        const amountOutMin = (0, swap_1.estimateAmountOutMin)({
            amountInRaw: amountIn,
            quoteDecimals: position.tokenDecimals,
            tokenDecimals: position.quoteTokenDecimals,
            quotePriceUsd: exitPriceUsd,
            tokenPriceUsd: quoteMarket.priceUsd,
            slippageBps: this.config.risk.slippageBps,
        });
        const txHash = await (0, swap_1.executeSwap)({
            publicClient: this.clients.publicClient,
            walletClient: this.clients.walletClient,
            accountAddress: this.clients.address,
            config: this.config,
        }, {
            dex: position.dex,
            tokenIn: position.tokenAddress,
            tokenOut: position.quoteTokenAddress,
            amountIn,
            amountOutMin,
        });
        await (0, swap_1.waitForSuccess)(this.clients.publicClient, txHash);
        return this.store.close(position.id, {
            exitReason: reason,
            exitPriceUsd,
            exitTxHash: txHash,
        });
    }
    async closeHyperliquidPosition(position, reason, exitPriceUsd) {
        if (!position.marketSymbol) {
            throw new Error("hyperliquid position missing market symbol");
        }
        const market = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.config, position.marketSymbol);
        if (!market) {
            throw new Error(`missing hyperliquid market ${position.marketSymbol}`);
        }
        if (this.config.dryRun) {
            return this.store.close(position.id, {
                exitReason: reason,
                exitPriceUsd,
                exitTxHash: syntheticHash(),
            });
        }
        const execution = await (0, hyperliquid_1.executeHyperliquidOrderLive)({
            config: this.config,
            market,
            side: "sell",
            leverage: position.leverage ?? this.config.hyperliquid.defaultLeverage,
            slippageBps: this.config.risk.slippageBps,
            reduceOnly: true,
            sizeRaw: position.quantityTokenRaw,
        });
        return this.store.close(position.id, {
            exitReason: reason,
            exitPriceUsd: execution.fillPriceUsd,
            exitTxHash: execution.txHash,
        });
    }
    async tryOpenPosition(candidate, marketSignals = []) {
        if (this.config.executionVenue === "hyperliquid-perp") {
            return this.tryOpenHyperliquidPosition(candidate, marketSignals);
        }
        return this.tryOpenSpotPosition(candidate);
    }
    async tryOpenHyperliquidPosition(candidate, marketSignals) {
        const openPositions = !this.config.dryRun ? await this.getHyperliquidOpenPositionsFromVenue() : this.store.getOpen();
        if (openPositions.length >= this.config.risk.maxOpenPositions) {
            return null;
        }
        let selectedSignal = null;
        let market = null;
        // News-first routing: pick strongest bullish market signal that exists on Hyperliquid.
        // Skip conflicted signals (high contradiction = sources disagree on direction).
        for (const signal of marketSignals) {
            if (signal.direction !== "bullish")
                continue;
            if (signal.contradictionPenalty > 0.7) {
                console.log(`[trader] skipping conflicted signal: ${signal.symbol} contradiction=${signal.contradictionPenalty.toFixed(2)}`);
                continue;
            }
            const signaledMarket = await (0, hyperliquid_1.fetchHyperliquidMarketBySymbol)(this.config, signal.symbol);
            if (!signaledMarket)
                continue;
            selectedSignal = signal;
            market = signaledMarket;
            console.log(`[trader] signal-route: ${signal.symbol} score=${signal.score.toFixed(3)} contradiction=${signal.contradictionPenalty.toFixed(2)} obs=${signal.observations}`);
            break;
        }
        if (!market) {
            console.log("[trader] no qualifying signal, falling back to scanner candidate");
            market = await (0, hyperliquid_1.resolveHyperliquidMarketForLaunch)(this.config, candidate);
        }
        if (!market || !market.priceUsd || market.priceUsd <= 0) {
            return null;
        }
        if (openPositions.some((position) => position.marketSymbol === market.symbol)) {
            return null;
        }
        const rawConviction = selectedSignal ? selectedSignal.score : 1;
        const convictionMultiplier = Number.isFinite(rawConviction)
            ? Math.min(1.5, Math.max(0.75, rawConviction))
            : 1;
        const requestedNotionalUsd = Math.min(this.config.hyperliquid.entryNotionalUsd * convictionMultiplier, this.config.risk.maxPositionUsd);
        if (!Number.isFinite(requestedNotionalUsd) || requestedNotionalUsd <= 0) {
            return null;
        }
        const exchangeMinNotionalUsd = computeHyperliquidMinOrderNotionalUsd(market.priceUsd, market.szDecimals);
        if (!Number.isFinite(exchangeMinNotionalUsd) || exchangeMinNotionalUsd <= 0) {
            return null;
        }
        const notionalUsd = Math.max(requestedNotionalUsd, exchangeMinNotionalUsd);
        const portfolioNotional = openPositions.reduce((sum, position) => sum + position.entryNotionalUsd, 0);
        if (portfolioNotional + notionalUsd > this.config.risk.maxPortfolioUsd) {
            throw new Error("portfolio limit reached");
        }
        const order = this.config.dryRun
            ? await (0, hyperliquid_1.simulateHyperliquidOrder)({
                config: this.config,
                symbol: market.symbol,
                marketId: market.marketId,
                side: "buy",
                leverage: this.config.hyperliquid.defaultLeverage,
                notionalUsd,
                szDecimals: market.szDecimals,
            })
            : await (0, hyperliquid_1.executeHyperliquidOrderLive)({
                config: this.config,
                market,
                side: "buy",
                leverage: this.config.hyperliquid.defaultLeverage,
                slippageBps: this.config.risk.slippageBps,
                notionalUsd,
            });
        const quoteTokenAddress = this.config.quoteTokens.USDC ?? candidate.tokenAddress;
        const quoteDecimals = this.config.quoteTokenDecimals.USDC ?? 6;
        const quoteSpentRaw = Math.max(1, Math.floor(order.notionalUsd * 10 ** quoteDecimals)).toString();
        const opened = {
            id: (0, node_crypto_1.randomUUID)(),
            venue: "hyperliquid-perp",
            tokenAddress: quoteTokenAddress,
            tokenDecimals: market.szDecimals,
            quoteTokenAddress,
            quoteSymbol: "USD",
            quoteTokenDecimals: quoteDecimals,
            dex: candidate.dex,
            marketSymbol: market.symbol,
            marketId: market.marketId,
            leverage: order.leverage,
            poolAddress: candidate.poolAddress,
            entryPriceUsd: order.fillPriceUsd,
            quantityTokenRaw: order.sizeRaw,
            quoteSpentRaw,
            entryNotionalUsd: order.notionalUsd,
            stopLossPct: this.config.risk.stopLossPct,
            takeProfitPct: this.config.risk.takeProfitPct,
            openedAt: Date.now(),
            txHash: order.txHash,
            status: "open",
        };
        await this.store.upsert(opened);
        return opened;
    }
    async tryOpenSpotPosition(candidate) {
        const openPositions = this.store.getOpen();
        if (openPositions.length >= this.config.risk.maxOpenPositions) {
            return null;
        }
        const chainId = dexScreenerChainForVenue(this.config.executionVenue);
        const tokenCode = await this.clients.publicClient.getBytecode({
            address: candidate.tokenAddress,
        });
        if (!tokenCode || tokenCode === "0x") {
            return null;
        }
        const tokenMarket = await (0, market_1.fetchTokenMarketSnapshot)(candidate.tokenAddress, {
            chainId,
        });
        const quoteSymbol = (0, market_1.normalizeQuoteSymbol)(candidate.pairedAsset) ??
            (0, market_1.normalizeQuoteSymbol)(tokenMarket.quoteSymbol) ??
            "USDC";
        const quoteToken = this.config.quoteTokens[quoteSymbol];
        const quoteDecimals = this.config.quoteTokenDecimals[quoteSymbol];
        const amountIn = this.config.entryBudgetRaw[quoteSymbol];
        if (!quoteToken || quoteDecimals === undefined || amountIn === undefined || amountIn <= BigInt(0)) {
            return null;
        }
        const quoteMarket = await (0, market_1.fetchTokenMarketSnapshot)(quoteToken, {
            chainId,
        });
        const quotePriceUsd = quoteMarket.priceUsd ?? (quoteSymbol === "USDC" ? 1 : null);
        const tokenPriceUsd = tokenMarket.priceUsd ?? Number(candidate.dexScreenerData?.priceUsd ?? "");
        if (!quotePriceUsd || !Number.isFinite(tokenPriceUsd) || tokenPriceUsd <= 0) {
            return null;
        }
        if (!this.config.dryRun) {
            const balance = await this.clients.publicClient.readContract({
                address: quoteToken,
                abi: abi_1.ERC20_TRADE_ABI,
                functionName: "balanceOf",
                args: [this.clients.address],
            });
            if (balance < amountIn) {
                throw new Error(`insufficient ${quoteSymbol} balance`);
            }
        }
        const notionalUsd = (Number(amountIn) / 10 ** quoteDecimals) * quotePriceUsd;
        if (notionalUsd > this.config.risk.maxPositionUsd) {
            throw new Error(`position above max size (${notionalUsd.toFixed(2)} > ${this.config.risk.maxPositionUsd})`);
        }
        const portfolioNotional = openPositions.reduce((sum, position) => sum + position.entryNotionalUsd, 0);
        if (portfolioNotional + notionalUsd > this.config.risk.maxPortfolioUsd) {
            throw new Error("portfolio limit reached");
        }
        const tokenDecimals = await (0, swap_1.readTokenDecimals)(this.clients.publicClient, candidate.tokenAddress);
        const amountOutMin = (0, swap_1.estimateAmountOutMin)({
            amountInRaw: amountIn,
            quoteDecimals,
            tokenDecimals,
            quotePriceUsd,
            tokenPriceUsd,
            slippageBps: this.config.risk.slippageBps,
        });
        if (!this.config.dryRun && amountOutMin <= BigInt(0)) {
            throw new Error("amountOutMin resolved to zero");
        }
        const txHash = this.config.dryRun
            ? syntheticHash()
            : await (0, swap_1.executeSwap)({
                publicClient: this.clients.publicClient,
                walletClient: this.clients.walletClient,
                accountAddress: this.clients.address,
                config: this.config,
            }, {
                dex: candidate.dex,
                tokenIn: quoteToken,
                tokenOut: candidate.tokenAddress,
                amountIn,
                amountOutMin,
            });
        if (!this.config.dryRun) {
            await (0, swap_1.waitForSuccess)(this.clients.publicClient, txHash);
        }
        const opened = {
            id: (0, node_crypto_1.randomUUID)(),
            venue: this.config.executionVenue,
            tokenAddress: candidate.tokenAddress,
            tokenDecimals,
            quoteTokenAddress: quoteToken,
            quoteSymbol,
            quoteTokenDecimals: quoteDecimals,
            dex: candidate.dex,
            poolAddress: candidate.poolAddress,
            entryPriceUsd: tokenPriceUsd,
            quantityTokenRaw: amountOutMin > BigInt(0) ? amountOutMin.toString() : "1",
            quoteSpentRaw: amountIn.toString(),
            entryNotionalUsd: notionalUsd,
            stopLossPct: this.config.risk.stopLossPct,
            takeProfitPct: this.config.risk.takeProfitPct,
            openedAt: Date.now(),
            txHash,
            status: "open",
        };
        await this.store.upsert(opened);
        return opened;
    }
}
function syntheticHash() {
    const raw = (0, node_crypto_1.randomUUID)().split("-").join("").padEnd(64, "0").slice(0, 64);
    return `0x${raw}`;
}
let runnerCache = null;
function redactedConfigFrom(config) {
    return {
        executionVenue: config.executionVenue,
        dryRun: config.dryRun,
        performanceFeeBps: config.performanceFeeBps,
        rpcUrl: config.rpcUrl,
        scannerApiUrl: config.scannerApiUrl,
        quoteTokens: config.quoteTokens,
        risk: config.risk,
        safety: config.safety,
        hyperliquid: {
            apiUrl: config.hyperliquid.apiUrl,
            isTestnet: config.hyperliquid.isTestnet,
            accountAddress: config.hyperliquid.accountAddress ?? null,
            defaultMarket: config.hyperliquid.defaultMarket,
            defaultLeverage: config.hyperliquid.defaultLeverage,
            entryNotionalUsd: config.hyperliquid.entryNotionalUsd,
            minAccountValueUsd: config.hyperliquid.minAccountValueUsd,
        },
        gasMultiplierBps: config.gasMultiplierBps,
        maxPriorityFeePerGas: config.maxPriorityFeePerGas.toString(),
    };
}
function buildRunnerCacheKey(primary, baseParallel) {
    return JSON.stringify({
        primary: {
            executionVenue: primary.executionVenue,
            dryRun: primary.dryRun,
            scannerApiUrl: primary.scannerApiUrl,
            positionStorePath: primary.positionStorePath,
            minScore: primary.risk.minScore,
            maxOpenPositions: primary.risk.maxOpenPositions,
            maxPositionUsd: primary.risk.maxPositionUsd,
        },
        baseParallel: baseParallel
            ? {
                enabled: true,
                executionVenue: baseParallel.executionVenue,
                dryRun: baseParallel.dryRun,
                scannerApiUrl: baseParallel.scannerApiUrl,
                positionStorePath: baseParallel.positionStorePath,
                minScore: baseParallel.risk.minScore,
                maxOpenPositions: baseParallel.risk.maxOpenPositions,
                maxPositionUsd: baseParallel.risk.maxPositionUsd,
            }
            : { enabled: false },
    });
}
function getTraderRunners() {
    const primaryConfig = (0, config_1.getTraderConfig)();
    const baseParallelConfig = (0, config_1.getParallelBaseConfig)();
    const key = buildRunnerCacheKey(primaryConfig, baseParallelConfig);
    if (runnerCache && runnerCache.key === key) {
        return runnerCache.runners;
    }
    const nextRunners = [
        {
            id: "primary",
            label: "primary",
            config: primaryConfig,
            engine: new TraderEngine(primaryConfig),
        },
    ];
    if (baseParallelConfig) {
        nextRunners.push({
            id: "base-parallel",
            label: "base-parallel",
            config: baseParallelConfig,
            engine: new TraderEngine(baseParallelConfig),
        });
    }
    runnerCache = {
        key,
        runners: nextRunners,
    };
    return nextRunners;
}
function getTraderEngine() {
    return getTraderRunners()[0].engine;
}
function getParallelTraderEngines() {
    return getTraderRunners()
        .slice(1)
        .map((runner) => ({
        runnerId: runner.id,
        label: runner.label,
    }));
}
async function runTraderCycle() {
    return getTraderEngine().runCycle();
}
async function runTraderCycles() {
    const runners = getTraderRunners();
    const executed = await Promise.all(runners.map(async (runner) => ({
        runnerId: runner.id,
        label: runner.label,
        report: await runner.engine.runCycle(),
    })));
    return {
        primary: executed[0].report,
        parallel: executed.slice(1),
    };
}
async function listTraderPositions() {
    return getTraderEngine().listPositions();
}
async function listTraderPositionsByRunner() {
    const runners = getTraderRunners();
    const collected = await Promise.all(runners.map(async (runner) => ({
        runnerId: runner.id,
        label: runner.label,
        positions: await runner.engine.listPositions(),
    })));
    return {
        primary: collected[0].positions,
        parallel: collected.slice(1),
    };
}
async function getTraderReadiness() {
    return getTraderEngine().getReadiness();
}
async function getTraderReadinessByRunner() {
    const runners = getTraderRunners();
    const collected = await Promise.all(runners.map(async (runner) => ({
        runnerId: runner.id,
        label: runner.label,
        readiness: await runner.engine.getReadiness(),
    })));
    return {
        primary: collected[0].readiness,
        parallel: collected.slice(1),
    };
}
async function getTraderPerformance() {
    return getTraderEngine().getPerformance();
}
async function getTraderPerformanceByRunner() {
    const runners = getTraderRunners();
    const collected = await Promise.all(runners.map(async (runner) => ({
        runnerId: runner.id,
        label: runner.label,
        performance: await runner.engine.getPerformance(),
    })));
    return {
        primary: collected[0].performance,
        parallel: collected.slice(1),
    };
}
function redactedConfigSummary() {
    const runners = getTraderRunners();
    const primary = redactedConfigFrom(runners[0].config);
    const parallelRunners = runners.slice(1).map((runner) => ({
        runnerId: runner.id,
        label: runner.label,
        config: redactedConfigFrom(runner.config),
    }));
    return {
        ...primary,
        parallelRunners,
    };
}
