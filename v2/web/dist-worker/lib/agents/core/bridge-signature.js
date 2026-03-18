"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signBridgeMessage = signBridgeMessage;
exports.verifyBridgeMessage = verifyBridgeMessage;
exports.bridgeSignatureIsRequired = bridgeSignatureIsRequired;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const BRIDGE_SIGNATURE_VERSION = "pooter-agent-bridge-v1";
const DEFAULT_MAX_SKEW_MS = 15 * 60 * 1000;
function readEnv(name) {
    const value = process.env[name]?.trim();
    return value && value.length > 0 ? value : null;
}
function getBridgePrivateKey() {
    const value = readEnv("AGENT_BRIDGE_PRIVATE_KEY");
    return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? value : null;
}
function getAllowedBridgeSigners() {
    const raw = readEnv("AGENT_BRIDGE_ALLOWED_SIGNERS");
    if (!raw)
        return new Set();
    return new Set(raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => (0, viem_1.isAddress)(entry))
        .map((entry) => (0, viem_1.getAddress)(entry).toLowerCase()));
}
function shouldRequireBridgeSignature() {
    const explicit = readEnv("AGENT_BRIDGE_REQUIRE_SIGNATURE");
    if (explicit) {
        return explicit === "1" || explicit.toLowerCase() === "true" || explicit.toLowerCase() === "yes";
    }
    return getAllowedBridgeSigners().size > 0;
}
function getMaxBridgeSkewMs() {
    const parsed = Number(readEnv("AGENT_BRIDGE_MAX_SKEW_MS"));
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_MAX_SKEW_MS;
    return Math.floor(parsed);
}
function stableStringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    const record = value;
    const entries = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(",")}}`;
}
function buildCanonicalBridgePayload(args) {
    return stableStringify({
        version: args.version ?? BRIDGE_SIGNATURE_VERSION,
        origin: args.origin,
        audience: args.audience,
        relayTimestampMs: args.relayTimestampMs,
        message: {
            id: args.message.id,
            from: args.message.from,
            to: args.message.to,
            topic: args.message.topic,
            payload: args.message.payload ?? null,
            meta: args.message.meta ?? null,
            timestamp: args.message.timestamp,
        },
    });
}
async function signBridgeMessage(args) {
    const privateKey = getBridgePrivateKey();
    if (!privateKey)
        return null;
    const account = (0, accounts_1.privateKeyToAccount)(privateKey);
    const relayTimestampMs = Math.max(0, Math.floor(args.relayTimestampMs ?? Date.now()));
    const payload = buildCanonicalBridgePayload({
        message: args.message,
        origin: args.origin,
        audience: args.audience,
        relayTimestampMs,
    });
    const signature = await account.signMessage({ message: payload });
    return {
        version: BRIDGE_SIGNATURE_VERSION,
        signer: account.address,
        signature,
        origin: args.origin,
        audience: args.audience,
        relayTimestampMs,
    };
}
async function verifyBridgeMessage(args) {
    const signature = args.headers.get("x-agent-bridge-signature");
    const claimedSigner = args.headers.get("x-agent-bridge-signer");
    const origin = args.headers.get("x-agent-bridge-origin");
    const audience = args.headers.get("x-agent-bridge-audience");
    const version = args.headers.get("x-agent-bridge-version");
    const relayTimestampRaw = args.headers.get("x-agent-bridge-timestamp");
    const relayTimestampMs = relayTimestampRaw && /^\d+$/.test(relayTimestampRaw) ? Number(relayTimestampRaw) : null;
    if (!signature) {
        return {
            present: false,
            verified: false,
            trusted: false,
            signer: null,
            claimedSigner,
            signature: null,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: relayTimestampMs === null ? null : Date.now() - relayTimestampMs,
            version,
            reason: shouldRequireBridgeSignature() ? "missing signature" : null,
        };
    }
    if (!origin || !audience || !version || relayTimestampMs === null) {
        return {
            present: true,
            verified: false,
            trusted: false,
            signer: null,
            claimedSigner,
            signature,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: relayTimestampMs === null ? null : Date.now() - relayTimestampMs,
            version,
            reason: "missing bridge signature headers",
        };
    }
    if (audience !== args.expectedAudience) {
        return {
            present: true,
            verified: false,
            trusted: false,
            signer: null,
            claimedSigner,
            signature,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: Date.now() - relayTimestampMs,
            version,
            reason: `audience mismatch (${audience})`,
        };
    }
    if (Math.abs(Date.now() - relayTimestampMs) > getMaxBridgeSkewMs()) {
        return {
            present: true,
            verified: false,
            trusted: false,
            signer: null,
            claimedSigner,
            signature,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: Date.now() - relayTimestampMs,
            version,
            reason: "bridge signature expired",
        };
    }
    try {
        const payload = buildCanonicalBridgePayload({
            message: args.message,
            origin,
            audience,
            relayTimestampMs,
            version,
        });
        const recovered = (0, viem_1.getAddress)(await (0, viem_1.recoverMessageAddress)({
            message: payload,
            signature: signature,
        }));
        if (claimedSigner && (0, viem_1.isAddress)(claimedSigner) && (0, viem_1.getAddress)(claimedSigner) !== recovered) {
            return {
                present: true,
                verified: false,
                trusted: false,
                signer: recovered,
                claimedSigner,
                signature,
                origin,
                audience,
                relayTimestampMs,
                relayAgeMs: Date.now() - relayTimestampMs,
                version,
                reason: "claimed signer does not match recovered signer",
            };
        }
        const allowedSigners = getAllowedBridgeSigners();
        const trusted = allowedSigners.size === 0 || allowedSigners.has(recovered.toLowerCase());
        return {
            present: true,
            verified: true,
            trusted,
            signer: recovered,
            claimedSigner,
            signature,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: Date.now() - relayTimestampMs,
            version,
            reason: trusted ? null : "signer not allowlisted",
        };
    }
    catch (error) {
        return {
            present: true,
            verified: false,
            trusted: false,
            signer: null,
            claimedSigner,
            signature,
            origin,
            audience,
            relayTimestampMs,
            relayAgeMs: Date.now() - relayTimestampMs,
            version,
            reason: error instanceof Error ? error.message : "signature verification failed",
        };
    }
}
function bridgeSignatureIsRequired() {
    return shouldRequireBridgeSignature();
}
