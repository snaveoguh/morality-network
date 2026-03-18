"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEntityHash = computeEntityHash;
exports.detectEntityType = detectEntityType;
exports.shortenAddress = shortenAddress;
exports.entityTypeLabel = entityTypeLabel;
exports.formatEth = formatEth;
exports.getDailyEditionHashClient = getDailyEditionHashClient;
exports.timeAgo = timeAgo;
const viem_1 = require("viem");
const contracts_1 = require("./contracts");
function computeEntityHash(identifier) {
    return (0, viem_1.keccak256)((0, viem_1.toBytes)(identifier));
}
function detectEntityType(identifier) {
    // Ethereum address: 0x followed by 40 hex chars
    if (/^0x[a-fA-F0-9]{40}$/.test(identifier)) {
        // Heuristic: could be a contract or an EOA
        // Default to ADDRESS, caller can override for known contracts
        return contracts_1.EntityType.ADDRESS;
    }
    // URL: starts with http(s)://
    if (/^https?:\/\//.test(identifier)) {
        return contracts_1.EntityType.URL;
    }
    // Domain: basic domain pattern (no protocol, has dots)
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(identifier)) {
        return contracts_1.EntityType.DOMAIN;
    }
    // Fallback to URL
    return contracts_1.EntityType.URL;
}
function shortenAddress(address, chars = 4) {
    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
function entityTypeLabel(entityType) {
    switch (entityType) {
        case contracts_1.EntityType.URL:
            return "URL";
        case contracts_1.EntityType.DOMAIN:
            return "Domain";
        case contracts_1.EntityType.ADDRESS:
            return "Address";
        case contracts_1.EntityType.CONTRACT:
            return "Contract";
        default:
            return "Unknown";
    }
}
function formatEth(wei) {
    const eth = Number(wei) / 1e18;
    if (eth === 0)
        return "0 ETH";
    if (eth < 0.001)
        return "<0.001 ETH";
    if (eth < 1)
        return `${eth.toFixed(4)} ETH`;
    return `${eth.toFixed(3)} ETH`;
}
/** Client-safe daily edition hash — mirrors server-side getDailyEditionHash(). */
function getDailyEditionHashClient() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return computeEntityHash(`pooter-daily-${yyyy}-${mm}-${dd}`);
}
function timeAgo(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60)
        return "just now";
    if (diff < 3600)
        return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)
        return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800)
        return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
}
