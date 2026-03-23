# Security Audit Report: Morality Network Vault/Bridge/Strategy Contracts

**Date:** 2026-03-22
**Auditor:** Claude (automated static analysis)
**Solidity Version:** 0.8.24
**Scope:** 10 new contracts + 8 interfaces in `contracts/src/`

> **Disclaimer:** This is an automated code review, not a formal audit by a professional security firm. Before deploying contracts that manage real user funds, engage a reputable auditor (Trail of Bits, OpenZeppelin, Spearbit, etc.) for a manual review.

---

## Executive Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 4 | Single-operator custody, hot wallet has no forced-return, roles settable to address(0), cancelled withdrawals lock shares |
| **HIGH** | 12 | NAV manipulation, manager drain vector, reentrancy in BridgeRouter, accounting manipulation, no stuck-route recovery, LP approval dependency |
| **MEDIUM** | 18 | Sandwich attacks, stale NAV pricing, slippage gaps, fee-on-transfer tokens, Morpho vault migration, silent partial withdrawals |
| **LOW** | 14 | Missing events, missing `__gap`, SafeERC20 not used, USDT incompatibility, UUPSUpgradeable init |
| **INFO** | 4 | Trust model documentation, storage layout verification, pnlBps overflow (theoretical) |
| **Total** | **52** | |

**Architecture risk:** The system is fundamentally custodial. Smart contracts manage accounting and permissions, but actual fund safety depends on the integrity of ~4 privileged EOA keys (owner, operator, reporter, bridge executor). A single compromised key in the chain can drain funds with no onchain recourse. **No timelocks, multisig requirements, or guardian mechanisms exist on any privileged operation.**

---

## Architecture Overview

```
User deposits ETH
        |
        v
 MoralityAgentVault / BaseCapitalVault  (Base L2)
        |                    |
        |              MorphoReserveAllocator (yield on idle reserves)
        |
        v
   BridgeRouter (Base) ---> ExecutorAssetConverter (WETH->bridgeAsset)
        |                         |
        v                         v
   ExecutorBridgeAdapter -----> bridgeExecutor EOA
        |
        v
   ArbTransitEscrow (Arbitrum)
        |
        v
   HLStrategyManager ---> strategyHotWallet (HyperLiquid)
        |
        v
   NavReporter ---> settleDailyNav() updates share price
```

---

## Findings

### CRITICAL

#### C-1: Single-Operator Custody Model — No Onchain Fund Recovery
**Contracts:** HLStrategyManager, ArbTransitEscrow, all
**Description:** The strategy hot wallet holds funds offchain (on HyperLiquid) with no smart contract enforcement for return. `pullbackToTransitEscrow` requires the hot wallet to have granted ERC20 approval — if the wallet revokes approval or the operator loses keys, funds are permanently lost. The entire system's fund flow depends on a chain of trusted EOAs (owner → operator → bridge executor → hot wallet) with no timelocks, multisig, or guardian mechanisms.
**Impact:** Total loss of strategy funds if any key in the trust chain is compromised or lost.
**Recommendation:** Use a smart contract wallet for the hot wallet with immutable approval. Add timelocks (24-48h) on all role changes. Require multisig for operations above a threshold. Add a guardian role that can veto suspicious transactions.

#### C-2: Cancelled Withdrawals Permanently Lock User Shares
**Contracts:** WithdrawalQueue.sol lines 104-111, BaseCapitalVault.sol line 199
**Description:** When a withdrawal is requested, shares transfer from the user to the WithdrawalQueue contract. The `cancel()` function marks the request as finalized but does NOT transfer shares back to the owner. Furthermore, BaseCapitalVault has no function that calls `queue.cancel()` — the cancel code path is completely unreachable.
**Impact:** Direct loss of user funds. Any cancelled withdrawal request permanently locks shares in the queue with no recovery mechanism.
**Recommendation:** Add a `cancelWithdrawalRequest(uint256 requestId)` function to BaseCapitalVault that calls `queue.cancel()` and transfers shares back to the original owner.

#### C-3: NAV Reporter Can Override All Accounting Buckets
**Contracts:** BaseCapitalVault.sol lines 364-384, NavReporter.sol lines 78-101
**Description:** `settleDailyNav` overwrites `hlStrategyAssetsStored`, `reserveAssetsStored`, `pendingBridgeAssetsStored`, and `accruedFeesEth`. The delta check (`maxNavDeltaBps`, default 10%) only applies to strategy and fees — reserve and pending bridge values have ZERO delta protection. On the first call (`lastNavTimestamp == 0`), there is NO delta check at all. A reporter can compound 10% changes daily.
**Impact:** Gradual NAV manipulation enabling share price inflation/deflation. First report can set arbitrary values. Reserve/bridge buckets can be set to any value on every call.
**Recommendation:** Apply delta checks to all four bucket values. Remove or limit the first-call bypass. Add timelock or multi-sig for NAV settlements.

#### C-4: Privileged Roles Settable to address(0) in BaseCapitalVault
**Contracts:** BaseCapitalVault.sol lines 386-409
**Description:** `setAllocator`, `setNavReporter`, `setReserveAllocator`, `setWithdrawalQueue`, and `setBridgeRouter` all accept `address(0)`. This permanently disables the associated functionality until the owner re-sets the address.
**Impact:** Owner mistake bricks critical vault operations. While not exploitable externally, it's a severe operational risk.
**Recommendation:** Add `require(addr != address(0))` checks to all role setters.

---

### HIGH

#### H-1: Manager Can Drain Vault to Arbitrary Address
**Contract:** MoralityAgentVault.sol lines 303-323
**Description:** The `manager` can call `allocateToStrategy(address payable to, uint256 amount)` sending vault ETH to ANY address, capped at `maxAllocationBps` (default 50%, settable to 100%). The manager can also call `reportStrategyLoss` to write off deployed capital without proof.
**Impact:** A compromised manager drains up to 100% of vault assets to any wallet, then reports a "loss" to cover it.
**Recommendation:** Restrict `to` to a whitelist of strategy addresses. Cap `setMaxAllocationBps` below 10000. Add timelock or multi-sig on `reportStrategyLoss`.

#### H-2: BridgeRouter Has No Reentrancy Protection
**Contract:** BridgeRouter.sol lines 130-134, 307-330
**Description:** `bridgeToArbitrum` calls vault, assetConverter, and bridgeAdapter (all configurable external addresses) then writes state. No `nonReentrant` modifier exists on any function. A malicious converter or adapter could re-enter.
**Impact:** Reentrancy via malicious downstream contracts could corrupt `totalPendingAssets` or drain vault.
**Recommendation:** Add `ReentrancyGuardUpgradeable` with `nonReentrant` on all state-mutating functions.

#### H-3: Allocator Can Manipulate Accounting Without Moving Real Assets
**Contract:** BaseCapitalVault.sol lines 292-307, 331-354
**Description:** `markBridgeOut`, `markBridgeIn`, `markStrategyIncrease`, `markStrategyDecrease` are pure bookkeeping — no actual token transfers. A compromised allocator can inflate `hlStrategyAssetsStored` (no invariant check) to inflate share price, then redeem at the inflated price.
**Impact:** Share price manipulation enabling value extraction bounded by liquid WETH.
**Recommendation:** Add onchain attestation for strategy balance changes. Consider requiring NAV reporter confirmation.

#### H-4: Bridge Executor Is Fully Trusted Oracle
**Contract:** BridgeRouter.sol lines 139-215
**Description:** The `bridgeExecutor` controls ALL route state transitions with no cross-chain proof. Can call `beginReturnFromStrategy` with arbitrary `assets` values, inflate `totalPendingAssets`, mark routes as Failed to prevent strategy deployment.
**Impact:** Complete route manipulation and accounting fraud.
**Recommendation:** Add bounds checking on return amounts. Consider timelock for large operations. Build off-chain monitoring.

#### H-5: Owner Can Manipulate Conversion Rates to Extract Value
**Contract:** ExecutorAssetConverter.sol lines 153-158
**Description:** Owner sets `toBridgeRateE18` and `toVaultRateE18` to any value >0 with no bounds or timelock. Can front-run pending conversions with rate changes.
**Impact:** Value extraction from liquidity providers on every bridge operation.
**Recommendation:** Add rate bounds, timelock on changes, or oracle-based pricing.

#### H-6: Liquidity Providers Must Maintain Permanent Unlimited Approval
**Contracts:** ExecutorAssetConverter.sol lines 105/119, ExecutorBridgeAdapter.sol line 87
**Description:** The system uses `transferFrom` to pull funds from external LP addresses and the bridge executor EOA. Revoked approval at any point in the chain halts all bridge operations.
**Impact:** Single point of failure DoS-es the entire bridge. LPs must trust the contract with unlimited approval forever.
**Recommendation:** Use deposit-based patterns where actors push funds into contracts.

#### H-7: No Recovery Mechanism for Stuck Bridge Routes
**Contract:** BridgeRouter.sol
**Description:** If a route gets stuck in `DeployedToHl` state and the executor goes offline, there is no admin function or timeout to recover. `markFailedRoute` only works on `Pending` or `ReceivedOnArb` states.
**Impact:** Permanent fund lockup in intermediate states with no recovery path.
**Recommendation:** Add owner-callable emergency function with timelock that force-transitions stuck routes after a grace period (e.g., 7 days).

#### H-8: ERC-4626 Vault Share Price Manipulation Affects NAV
**Contract:** MorphoReserveAllocator.sol lines 95-100
**Description:** `totalManagedAssets()` calls `previewRedeem()` on the Morpho vault, which can be flash-loan manipulated in the same block as a NAV report.
**Impact:** Inflated reserve value flows into `settleDailyNav`, enabling share price manipulation.
**Recommendation:** Use time-weighted readings or snapshot from a previous block.

#### H-9: No Emergency Withdrawal from ArbTransitEscrow
**Contract:** ArbTransitEscrow.sol
**Description:** Owner can change role addresses but cannot directly withdraw tokens. No `emergencyWithdraw` function exists.
**Impact:** Permanent loss of escrowed funds if both privileged roles become unavailable.
**Recommendation:** Add `emergencyWithdraw(address token, uint256 amount, address receiver) external onlyOwner` with timelock.

#### H-10: MorphoReserveAllocator Withdraw Can Silently Return Fewer Assets
**Contract:** MorphoReserveAllocator.sol lines 65-93
**Description:** `withdraw` can return `assetsOut < assets` (partial fill) without reverting. The vault receives less than expected with no error.
**Impact:** Accounting discrepancies and inability to honor user redemptions.
**Recommendation:** Revert if `assetsOut < assets`, or return the actual amount and let the vault handle the shortfall explicitly.

#### H-11: Bridge Executor Can Release Escrow Funds to Arbitrary Addresses
**Contract:** ArbTransitEscrow.sol lines 87-95
**Description:** `releaseToBridge` sends funds to any `receiver` address with no whitelist.
**Impact:** Complete loss of escrowed funds if bridge executor is compromised.
**Recommendation:** Maintain a whitelist of allowed bridge receiver addresses.

#### H-12: Deposit Front-Running via NAV Settlement
**Contract:** BaseCapitalVault.sol lines 178-191
**Description:** `depositETH` has no minimum shares output parameter. A NAV settlement right before a deposit gives the depositor fewer shares.
**Impact:** Deposits can be sandwiched around NAV settlements.
**Recommendation:** Add `minSharesOut` parameter.

---

### MEDIUM

#### M-1: Share Price Manipulation via Forced ETH Transfer
**Contract:** MoralityAgentVault.sol lines 111-125
**Description:** `totalManagedAssets()` uses `address(this).balance`. ETH force-sent via `selfdestruct` inflates share price. Virtual offset (1e3) mitigates first-depositor attack but not large donations.
**Recommendation:** Track internal ETH balance explicitly.

#### M-2: Sandwich Attack on NavReporter
**Contract:** NavReporter.sol lines 78-101
**Description:** `reportNav` is a public transaction visible in the mempool. MEV searchers can deposit before NAV-increasing reports or redeem before NAV-decreasing reports.
**Recommendation:** Use commit-reveal scheme or private mempool. Add deposit/withdrawal cooldown after NAV settlement.

#### M-3: Reserve/Bridge Reads Manipulable Within Same Block
**Contract:** NavReporter.sol lines 88-91
**Description:** `totalManagedAssets()` from MorphoReserveAllocator and `totalPendingAssets()` from BridgeRouter can be manipulated via flash loans in the same block as NAV settlement.
**Recommendation:** Snapshot values with time delay or use TWAP.

#### M-4: No Slippage Protection on Redemptions
**Contract:** BaseCapitalVault.sol lines 205-218
**Description:** `redeemInstant` has no `minAssetsOut` parameter. NAV settlement between submission and execution changes output.
**Recommendation:** Add `minAssetsOut` parameter.

#### M-5: Withdrawal Queue Price Risk
**Contract:** BaseCapitalVault.sol lines 220-244
**Description:** Queued withdrawals use current share price at fulfillment, not at request time. Users bear price risk with no minimum guarantee.
**Recommendation:** Allow minimum acceptable output at request time.

#### M-6: Bridge Return Can Inflate Liquid Assets
**Contract:** BaseCapitalVault.sol lines 318-329
**Description:** `settleBridgeReturn` takes separate `pendingReduction` and `liquidIncrease` parameters. If `liquidIncrease > pendingReduction`, phantom assets are created.
**Recommendation:** Enforce `liquidIncrease <= pendingReduction` or account for bridge fees explicitly.

#### M-7: No Fee Withdrawal Mechanism
**Contract:** BaseCapitalVault.sol line 42
**Description:** `accruedFeesEth` is tracked and reduces NAV but there is no function to claim/withdraw these fees. They are effectively burned.
**Recommendation:** Add `claimFees()` function.

#### M-8: Slippage Check Uses Wrong Denomination
**Contract:** BridgeRouter.sol lines 325-327
**Description:** Slippage check compares vault-denominated output against bridge-denominated input. When assets have different valuations or decimals, the check is meaningless.
**Recommendation:** Compare against original vault-denominated `route.outboundAssets`.

#### M-9: `minReturnBps` Can Be Set to Zero
**Contract:** BridgeRouter.sol lines 273-276
**Description:** Owner can disable all slippage protection by setting `minReturnBps` to 0.
**Recommendation:** Enforce minimum floor (e.g., 5000 = 50%).

#### M-10: No Reentrancy Guard on ExecutorAssetConverter
**Contract:** ExecutorAssetConverter.sol lines 95-121
**Description:** Two `transferFrom` calls per conversion with no reentrancy protection.
**Recommendation:** Add `ReentrancyGuardUpgradeable`.

#### M-11: Empty `_authorizeUpgrade` in Converter and Adapter
**Contracts:** ExecutorAssetConverter.sol line 85, ExecutorBridgeAdapter.sol line 57
**Description:** No `code.length > 0` check. Owner could upgrade to EOA, bricking the proxy.
**Recommendation:** Add `require(newImplementation.code.length > 0)`.

#### M-12: Bridge Adapter Allows Multiple Inbound Completions Per Route
**Contract:** ExecutorBridgeAdapter.sol lines 70, 90
**Description:** No `require(!route.inboundComplete)` check. Multiple calls accumulate and drain executor.
**Recommendation:** Add completion guards.

#### M-13: Fee-on-Transfer Token Accounting Mismatch
**Contract:** ArbTransitEscrow.sol lines 59-65
**Description:** `totalEscrowed += assets` uses the requested amount, not the actual received amount for fee-on-transfer tokens.
**Recommendation:** Measure actual balance change or document that fee-on-transfer tokens are unsupported.

#### M-14: Changing targetVault Orphans Existing Shares
**Contract:** MorphoReserveAllocator.sol lines 112-116
**Description:** `setTargetVault` changes the address immediately. Shares in the old vault become invisible and unredeemable — permanent fund loss.
**Recommendation:** Require `oldVault.balanceOf(address(this)) == 0` before allowing change.

#### M-15: No Slippage Protection on Morpho Deposit/Withdraw
**Contract:** MorphoReserveAllocator.sol lines 59, 80
**Description:** ERC-4626 deposit/withdraw called without minimum output checks. Sandwich-attackable.
**Recommendation:** Add min output parameters.

#### M-16: Stale NAV on Deposits/Redemptions
**Contracts:** BaseCapitalVault.sol lines 146-218
**Description:** No staleness check on `totalAssets()`. If NAV hasn't been reported in days, deposits/redemptions execute at stale prices.
**Recommendation:** Add `require(block.timestamp - lastNavTimestamp < MAX_NAV_AGE)` on deposit/redeem.

#### M-17: Unbounded Funders Array
**Contract:** MoralityAgentVault.sol lines 40-41, 245-248
**Description:** Funders are never removed even after full withdrawal. Array grows indefinitely.
**Recommendation:** Implement lazy cleanup or accept as known limitation.

#### M-18: HLStrategyManager Accounting Can Desynchronize
**Contract:** HLStrategyManager.sol lines 73-122
**Description:** `recordHyperliquidDeployment` is pure bookkeeping with no token movement verification. Accounting relies entirely on operator honesty.
**Recommendation:** Tie accounting to actual token movements where possible.

---

### LOW

#### L-1: Custom Reentrancy Guards Instead of OpenZeppelin
**Contracts:** MoralityAgentVault, BaseCapitalVault, WithdrawalQueue
**Recommendation:** Use `ReentrancyGuardUpgradeable` for community-reviewed implementation.

#### L-2: Missing `__gap` in ExecutorAssetConverter and ExecutorBridgeAdapter
**Recommendation:** Add `uint256[40] private __gap`.

#### L-3: `transferFrom` / `approve` Without SafeERC20
**Contracts:** BridgeRouter, ExecutorAssetConverter, ExecutorBridgeAdapter, ArbTransitEscrow, MorphoReserveAllocator, HLStrategyManager
**Recommendation:** Use `SafeERC20.safeTransfer`, `safeTransferFrom`, and `forceApprove` throughout.

#### L-4: Missing Events for Parameter Changes
**Contracts:** MoralityAgentVault (`setMaxAllocationBps`), BaseCapitalVault (`setMaxTotalAssets`)
**Recommendation:** Add events for all admin parameter changes.

#### L-5: `withdraw()` Not Pausable in MoralityAgentVault
**Description:** `deposit()` has `whenNotPaused` but `withdraw()`/`redeem()` do not.
**Recommendation:** Document if intentional (allow exits during emergency) or add pause.

#### L-6: UUPSUpgradeable Init Not Called
**Contracts:** BaseCapitalVault, others
**Recommendation:** Add `__UUPSUpgradeable_init()` for future-proofing.

#### L-7: `minReportInterval` Can Be Set to 0
**Contract:** NavReporter.sol line 119
**Recommendation:** Enforce minimum floor (e.g., 1 hour).

#### L-8: First NAV Report Has No Delta Check
**Contract:** NavReporter.sol lines 83-86
**Recommendation:** Require owner co-signature on initial report.

#### L-9: No Pending Request Enumeration in WithdrawalQueue
**Recommendation:** Add `pendingRequestCount` counter or linked list.

#### L-10: `setArbEscrow` Allows address(0)
**Contract:** BridgeRouter.sol lines 252-255
**Recommendation:** Add zero-address check.

#### L-11: `transferId` Uses Miner-Manipulable `block.timestamp`
**Contract:** ExecutorBridgeAdapter.sol line 74
**Impact:** Informational only — transferId is for events, not access control.

#### L-12: `totalDeployedAssets` Silently Floors at Zero
**Contract:** HLStrategyManager.sol lines 105-109
**Recommendation:** Emit warning event when assets returned exceed tracked deployed.

#### L-13: `totalPrincipal` Tracking Is Approximate
**Contract:** MorphoReserveAllocator.sol lines 85-90
**Recommendation:** Track shares instead, or remove if unused onchain.

#### L-14: Potential Overflow in `_convertAmount` for Large Values
**Contract:** ExecutorAssetConverter.sol line 175
**Recommendation:** Use `mulDiv` from OpenZeppelin Math library.

---

### INFO

#### I-1: Trust Model Requires Documentation
The system has many privileged roles: owner, manager, allocator, navReporter, bridgeRouter, bridgeExecutor, operator. Trust assumptions for each should be documented in a `TRUST_MODEL.md`.

#### I-2: No Timelock on Any Admin Operation
Owner can change any role address immediately. Consider `TimelockController` for all sensitive operations.

#### I-3: Cross-Chain State Is Entirely Off-Chain
BridgeRouter on Base and ArbTransitEscrow on Arbitrum have no onchain cross-chain verification. No proof verification (CCIP, Merkle proofs). The bridge executor is trusted to accurately relay state.

#### I-4: Storage Layout Should Be CI-Tested
Use `forge inspect --storage-layout` in CI to catch regressions across upgrades.

---

## Top 5 Recommendations (Priority Order)

1. **Fix the WithdrawalQueue cancel bug** (C-2) — shares are permanently locked on cancel. Add cancel flow from vault that returns shares.

2. **Add timelocks and multisig** (C-1, I-2) — place owner behind `TimelockController` with 24-48h delay. Use Safe multisig for all privileged roles.

3. **Fix NAV delta checks** (C-3) — apply delta bounds to ALL four bucket values. Remove first-report bypass. Add staleness guard on deposits/redemptions.

4. **Add reentrancy guards to BridgeRouter** (H-2) — use `ReentrancyGuardUpgradeable`. Apply `nonReentrant` to all state-mutating functions.

5. **Add slippage protection** (H-12, M-4) — add `minSharesOut` to deposit, `minAssetsOut` to redeem. Protects users from sandwich attacks around NAV settlements.

---

*Generated by automated static analysis. This report does not constitute a formal security audit. Engage a professional auditor before mainnet deployment.*
