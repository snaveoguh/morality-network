"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREDICTION_MARKET_ABI = exports.PREDICTION_MARKET_ADDRESS = exports.AGENT_VAULT_ABI = exports.EMBLEM_VAULT_ABI = exports.PROPOSAL_VOTING_ABI = exports.PROPOSAL_VOTING_ADDRESS = exports.NOUNS_TOKEN_ADDRESS = exports.EntityType = exports.POOTER_AUCTIONS_ABI = exports.POOTER_AUCTIONS_ADDRESS = exports.POOTER_EDITIONS_ABI = exports.POOTER_EDITIONS_ADDRESS = exports.LEADERBOARD_ABI = exports.TIPPING_ABI = exports.COMMENTS_ABI = exports.RATINGS_ABI = exports.REGISTRY_ABI = exports.CONTRACTS = exports.AGENT_VAULT_ADDRESS = exports.AGENT_VAULT_CHAIN_ID = exports.ZERO_ADDRESS = exports.PREDICTION_MARKET_CHAIN_ID = exports.CONTRACTS_CHAIN_ID = exports.ERC20_ABI = exports.MO_TOKEN = void 0;
const chains_1 = require("viem/chains");
// MO Token on Base
exports.MO_TOKEN = {
    address: "0x8729c70061739140ee6bE00A3875Cbf6d09A746C",
    symbol: "MO",
    name: "mo",
    decimals: 18,
};
// ERC20 ABI for MO token interactions
exports.ERC20_ABI = [
    {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "transfer",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "approve",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "allowance",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
];
// Base chain for registry/comments/tipping/leaderboard writes.
exports.CONTRACTS_CHAIN_ID = chains_1.base.id;
// Ethereum mainnet chain for trustless Nouns/Lil Nouns prediction markets.
exports.PREDICTION_MARKET_CHAIN_ID = chains_1.mainnet.id;
exports.ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
function readAddressEnv(name, fallback) {
    const rawValue = process.env[name];
    const trimmed = rawValue?.trim();
    return (trimmed && trimmed.length > 0 ? trimmed : fallback);
}
const parsedVaultChainId = Number(process.env.NEXT_PUBLIC_AGENT_VAULT_CHAIN_ID ?? `${chains_1.base.id}`);
exports.AGENT_VAULT_CHAIN_ID = Number.isFinite(parsedVaultChainId) && parsedVaultChainId > 0
    ? Math.trunc(parsedVaultChainId)
    : chains_1.base.id;
exports.AGENT_VAULT_ADDRESS = readAddressEnv("NEXT_PUBLIC_AGENT_VAULT_ADDRESS", exports.ZERO_ADDRESS);
// Contract addresses
// Defaults point to deployed Base mainnet contracts; override via NEXT_PUBLIC_* env vars.
exports.CONTRACTS = {
    registry: readAddressEnv("NEXT_PUBLIC_REGISTRY_ADDRESS", "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608"),
    ratings: readAddressEnv("NEXT_PUBLIC_RATINGS_ADDRESS", "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405"),
    comments: readAddressEnv("NEXT_PUBLIC_COMMENTS_ADDRESS", "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b"),
    tipping: readAddressEnv("NEXT_PUBLIC_TIPPING_ADDRESS", "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B"),
    leaderboard: readAddressEnv("NEXT_PUBLIC_LEADERBOARD_ADDRESS", "0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6"),
};
exports.REGISTRY_ABI = [
    {
        type: "function",
        name: "registerEntity",
        inputs: [
            { name: "identifier", type: "string" },
            { name: "entityType", type: "uint8" },
        ],
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "claimOwnership",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "approveOwnershipClaim",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "claimer", type: "address" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "setCanonicalClaim",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "claimText", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getEntity",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "entityHash", type: "bytes32" },
                    { name: "entityType", type: "uint8" },
                    { name: "identifier", type: "string" },
                    { name: "registeredBy", type: "address" },
                    { name: "claimedOwner", type: "address" },
                    { name: "createdAt", type: "uint256" },
                    { name: "exists", type: "bool" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "computeHash",
        inputs: [{ name: "identifier", type: "string" }],
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "pure",
    },
    {
        type: "function",
        name: "computeClaimHash",
        inputs: [{ name: "claimText", type: "string" }],
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "pure",
    },
    {
        type: "function",
        name: "getEntityCount",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getCanonicalClaim",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "claimHash", type: "bytes32" },
                    { name: "text", type: "string" },
                    { name: "setBy", type: "address" },
                    { name: "createdAt", type: "uint256" },
                    { name: "updatedAt", type: "uint256" },
                    { name: "version", type: "uint64" },
                    { name: "exists", type: "bool" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getClaimRevisionCount",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getClaimRevision",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "index", type: "uint256" },
        ],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "claimHash", type: "bytes32" },
                    { name: "text", type: "string" },
                    { name: "updatedBy", type: "address" },
                    { name: "timestamp", type: "uint256" },
                    { name: "version", type: "uint64" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "EntityRegistered",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "entityType", type: "uint8", indexed: false },
            { name: "identifier", type: "string", indexed: false },
            { name: "registeredBy", type: "address", indexed: true },
        ],
    },
    {
        type: "event",
        name: "CanonicalClaimSet",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "claimHash", type: "bytes32", indexed: true },
            { name: "claimText", type: "string", indexed: false },
            { name: "setBy", type: "address", indexed: true },
            { name: "version", type: "uint64", indexed: false },
        ],
    },
    {
        type: "event",
        name: "CanonicalClaimUpdated",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "previousClaimHash", type: "bytes32", indexed: true },
            { name: "newClaimHash", type: "bytes32", indexed: true },
            { name: "claimText", type: "string", indexed: false },
            { name: "updatedBy", type: "address", indexed: false },
            { name: "version", type: "uint64", indexed: false },
        ],
    },
];
exports.RATINGS_ABI = [
    {
        type: "function",
        name: "rate",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "score", type: "uint8" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "rateWithReason",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "score", type: "uint8" },
            { name: "reason", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "rateInterpretation",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "truth", type: "uint8" },
            { name: "importance", type: "uint8" },
            { name: "moralImpact", type: "uint8" },
            { name: "reason", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getAverageRating",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [
            { name: "avg", type: "uint256" },
            { name: "count", type: "uint256" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getAverageInterpretation",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [
            { name: "avgTruth", type: "uint256" },
            { name: "avgImportance", type: "uint256" },
            { name: "avgMoralImpact", type: "uint256" },
            { name: "count", type: "uint256" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserInterpretation",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "user", type: "address" },
        ],
        outputs: [
            { name: "truth", type: "uint8" },
            { name: "importance", type: "uint8" },
            { name: "moralImpact", type: "uint8" },
            { name: "timestamp", type: "uint256" },
            { name: "exists", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getUserRating",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "user", type: "address" },
        ],
        outputs: [
            { name: "score", type: "uint8" },
            { name: "timestamp", type: "uint256" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getRatingReason",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "user", type: "address" },
        ],
        outputs: [
            { name: "reason", type: "string" },
            { name: "timestamp", type: "uint256" },
            { name: "exists", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "Rated",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "rater", type: "address", indexed: true },
            { name: "score", type: "uint8", indexed: false },
        ],
    },
    {
        type: "event",
        name: "RatedWithReason",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "rater", type: "address", indexed: true },
            { name: "score", type: "uint8", indexed: false },
            { name: "reason", type: "string", indexed: false },
        ],
    },
    {
        type: "event",
        name: "InterpretationRated",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "rater", type: "address", indexed: true },
            { name: "truth", type: "uint8", indexed: false },
            { name: "importance", type: "uint8", indexed: false },
            { name: "moralImpact", type: "uint8", indexed: false },
            { name: "reason", type: "string", indexed: false },
        ],
    },
    {
        type: "event",
        name: "InterpretationRatingUpdated",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "rater", type: "address", indexed: true },
            { name: "oldTruth", type: "uint8", indexed: false },
            { name: "oldImportance", type: "uint8", indexed: false },
            { name: "oldMoralImpact", type: "uint8", indexed: false },
            { name: "newTruth", type: "uint8", indexed: false },
            { name: "newImportance", type: "uint8", indexed: false },
            { name: "newMoralImpact", type: "uint8", indexed: false },
            { name: "reason", type: "string", indexed: false },
        ],
    },
];
exports.COMMENTS_ABI = [
    {
        type: "function",
        name: "comment",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "content", type: "string" },
            { name: "parentId", type: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "commentStructured",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "content", type: "string" },
            { name: "parentId", type: "uint256" },
            { name: "argumentType", type: "uint8" },
            { name: "referenceCommentId", type: "uint256" },
            { name: "evidenceHash", type: "bytes32" },
        ],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "vote",
        inputs: [
            { name: "commentId", type: "uint256" },
            { name: "v", type: "int8" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "nextCommentId",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getComment",
        inputs: [{ name: "commentId", type: "uint256" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "id", type: "uint256" },
                    { name: "entityHash", type: "bytes32" },
                    { name: "author", type: "address" },
                    { name: "content", type: "string" },
                    { name: "parentId", type: "uint256" },
                    { name: "score", type: "int256" },
                    { name: "tipTotal", type: "uint256" },
                    { name: "timestamp", type: "uint256" },
                    { name: "exists", type: "bool" },
                ],
            },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getEntityComments",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "offset", type: "uint256" },
            { name: "limit", type: "uint256" },
        ],
        outputs: [{ name: "", type: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getEntityCommentCount",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getArgumentMeta",
        inputs: [{ name: "commentId", type: "uint256" }],
        outputs: [
            { name: "argumentType", type: "uint8" },
            { name: "referenceCommentId", type: "uint256" },
            { name: "evidenceHash", type: "bytes32" },
            { name: "exists", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getChildComments",
        inputs: [{ name: "parentId", type: "uint256" }],
        outputs: [{ name: "", type: "uint256[]" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "CommentCreated",
        inputs: [
            { name: "commentId", type: "uint256", indexed: true },
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "author", type: "address", indexed: true },
            { name: "parentId", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "StructuredCommentCreated",
        inputs: [
            { name: "commentId", type: "uint256", indexed: true },
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "author", type: "address", indexed: true },
            { name: "parentId", type: "uint256", indexed: false },
            { name: "argumentType", type: "uint8", indexed: false },
            { name: "referenceCommentId", type: "uint256", indexed: false },
            { name: "evidenceHash", type: "bytes32", indexed: false },
        ],
    },
];
exports.TIPPING_ABI = [
    {
        type: "function",
        name: "tipEntity",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "tipComment",
        inputs: [{ name: "commentId", type: "uint256" }],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "withdraw",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "claimEscrow",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "balances",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "entityTipTotals",
        inputs: [{ name: "", type: "bytes32" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "totalTipsGiven",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "totalTipsReceived",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "TipSent",
        inputs: [
            { name: "entityHash", type: "bytes32", indexed: true },
            { name: "tipper", type: "address", indexed: true },
            { name: "recipient", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "CommentTipped",
        inputs: [
            { name: "commentId", type: "uint256", indexed: true },
            { name: "tipper", type: "address", indexed: true },
            { name: "author", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
];
exports.LEADERBOARD_ABI = [
    {
        type: "function",
        name: "getCompositeScore",
        inputs: [{ name: "entityHash", type: "bytes32" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "aiScores",
        inputs: [{ name: "", type: "bytes32" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "updateAIScore",
        inputs: [
            { name: "entityHash", type: "bytes32" },
            { name: "score", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
];
// ============================================================================
// POOTER EDITIONS — 1/1 Daily Edition ERC-721 NFTs
// ============================================================================
exports.POOTER_EDITIONS_ADDRESS = readAddressEnv("NEXT_PUBLIC_POOTER_EDITIONS_ADDRESS", "0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e");
exports.POOTER_EDITIONS_ABI = [
    {
        type: "function",
        name: "mint",
        inputs: [
            { name: "editionNumber", type: "uint256" },
            { name: "contentHash", type: "bytes32" },
            { name: "dailyTitle", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "mintFor",
        inputs: [
            { name: "to", type: "address" },
            { name: "editionNumber", type: "uint256" },
            { name: "contentHash", type: "bytes32" },
            { name: "dailyTitle", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "ownerOf",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getEdition",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [
            { name: "contentHash", type: "bytes32" },
            { name: "editionDate", type: "uint256" },
            { name: "dailyTitle", type: "string" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "currentEditionNumber",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "totalMinted",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "EPOCH",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "EditionMinted",
        inputs: [
            { name: "tokenId", type: "uint256", indexed: true },
            { name: "minter", type: "address", indexed: true },
            { name: "contentHash", type: "bytes32", indexed: false },
            { name: "dailyTitle", type: "string", indexed: false },
        ],
    },
];
// ============================================================================
// POOTER AUCTIONS — On-demand 24hr edition auctions
// ============================================================================
exports.POOTER_AUCTIONS_ADDRESS = readAddressEnv("NEXT_PUBLIC_POOTER_AUCTIONS_ADDRESS", "0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f");
exports.POOTER_AUCTIONS_ABI = [
    {
        type: "function",
        name: "createAuction",
        inputs: [
            { name: "editionNumber", type: "uint256" },
            { name: "contentHash", type: "bytes32" },
            { name: "dailyTitle", type: "string" },
        ],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "bid",
        inputs: [{ name: "editionNumber", type: "uint256" }],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "settle",
        inputs: [{ name: "editionNumber", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "withdrawPendingReturn",
        inputs: [],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "auctions",
        inputs: [{ name: "editionNumber", type: "uint256" }],
        outputs: [
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "highestBidder", type: "address" },
            { name: "highestBid", type: "uint256" },
            { name: "contentHash", type: "bytes32" },
            { name: "dailyTitle", type: "string" },
            { name: "settled", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "pendingReturns",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "DURATION",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "MIN_BID",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "MIN_BID_INCREMENT_BPS",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "treasury",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "AuctionCreated",
        inputs: [
            { name: "editionNumber", type: "uint256", indexed: true },
            { name: "creator", type: "address", indexed: true },
            { name: "firstBid", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "AuctionBid",
        inputs: [
            { name: "editionNumber", type: "uint256", indexed: true },
            { name: "bidder", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "extended", type: "bool", indexed: false },
        ],
    },
    {
        type: "event",
        name: "AuctionSettled",
        inputs: [
            { name: "editionNumber", type: "uint256", indexed: true },
            { name: "winner", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "AuctionExtended",
        inputs: [
            { name: "editionNumber", type: "uint256", indexed: true },
            { name: "newEndTime", type: "uint256", indexed: false },
        ],
    },
];
// Entity type enum matching the Solidity enum
var EntityType;
(function (EntityType) {
    EntityType[EntityType["URL"] = 0] = "URL";
    EntityType[EntityType["DOMAIN"] = 1] = "DOMAIN";
    EntityType[EntityType["ADDRESS"] = 2] = "ADDRESS";
    EntityType[EntityType["CONTRACT"] = 3] = "CONTRACT";
})(EntityType || (exports.EntityType = EntityType = {}));
// ============================================================================
// NOUNS TOKEN (Ethereum mainnet)
// ============================================================================
exports.NOUNS_TOKEN_ADDRESS = "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03";
// ============================================================================
// PROPOSAL VOTING — Signal votes on DAO proposals
// Update after deployment
// ============================================================================
exports.PROPOSAL_VOTING_ADDRESS = "0x0000000000000000000000000000000000000000";
exports.PROPOSAL_VOTING_ABI = [
    {
        type: "function",
        name: "castVote",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
            { name: "support", type: "uint8" },
            { name: "reason", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getProposalVotes",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
        ],
        outputs: [
            { name: "forVotes", type: "uint256" },
            { name: "againstVotes", type: "uint256" },
            { name: "abstainVotes", type: "uint256" },
            { name: "totalVoters", type: "uint256" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getVote",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
            { name: "voter", type: "address" },
        ],
        outputs: [
            { name: "support", type: "uint8" },
            { name: "reason", type: "string" },
            { name: "timestamp", type: "uint256" },
            { name: "voted", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "isDaoResolvable",
        inputs: [{ name: "dao", type: "string" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "VoteCast",
        inputs: [
            { name: "proposalKey", type: "bytes32", indexed: true },
            { name: "voter", type: "address", indexed: true },
            { name: "support", type: "uint8", indexed: false },
            { name: "isNounHolder", type: "bool", indexed: false },
            { name: "reason", type: "string", indexed: false },
        ],
    },
    {
        type: "event",
        name: "RefundIssued",
        inputs: [
            { name: "voter", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
];
// ============================================================================
// EMBLEM VAULT — NFT vault for pepe listings (ERC-721 approval interface)
// ============================================================================
exports.EMBLEM_VAULT_ABI = [
    {
        type: "function",
        name: "isApprovedForAll",
        inputs: [
            { name: "owner", type: "address" },
            { name: "operator", type: "address" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "setApprovalForAll",
        inputs: [
            { name: "operator", type: "address" },
            { name: "approved", type: "bool" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
];
// ============================================================================
// AGENT VAULT — Shared capital pool for autonomous agent trading
// ============================================================================
exports.AGENT_VAULT_ABI = [
    {
        type: "function",
        name: "deposit",
        inputs: [],
        outputs: [{ name: "sharesMinted", type: "uint256" }],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "withdraw",
        inputs: [{ name: "assets", type: "uint256" }],
        outputs: [{ name: "sharesBurned", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "redeem",
        inputs: [{ name: "shares", type: "uint256" }],
        outputs: [{ name: "assetsOut", type: "uint256" }],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "shareBalance",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "convertToAssets",
        inputs: [{ name: "shares", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "maxWithdraw",
        inputs: [{ name: "funder", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getVaultState",
        inputs: [],
        outputs: [
            { name: "totalManagedAssets_", type: "uint256" },
            { name: "liquidAssets_", type: "uint256" },
            { name: "deployedCapital_", type: "uint256" },
            { name: "totalShares_", type: "uint256" },
            { name: "sharePriceE18_", type: "uint256" },
            { name: "performanceFeeBps_", type: "uint256" },
            { name: "manager_", type: "address" },
            { name: "feeRecipient_", type: "address" },
            { name: "cumulativeStrategyProfit_", type: "uint256" },
            { name: "cumulativeStrategyLoss_", type: "uint256" },
            { name: "totalFeesPaid_", type: "uint256" },
            { name: "funderCount_", type: "uint256" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getFunders",
        inputs: [
            { name: "offset", type: "uint256" },
            { name: "limit", type: "uint256" },
        ],
        outputs: [{ name: "", type: "address[]" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getFunderSnapshot",
        inputs: [{ name: "funder", type: "address" }],
        outputs: [
            { name: "shares", type: "uint256" },
            { name: "equityAssets", type: "uint256" },
            { name: "deposited", type: "uint256" },
            { name: "withdrawn", type: "uint256" },
            { name: "pnl", type: "int256" },
            { name: "pnlBps", type: "int256" },
        ],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "Deposited",
        inputs: [
            { name: "funder", type: "address", indexed: true },
            { name: "assets", type: "uint256", indexed: false },
            { name: "sharesMinted", type: "uint256", indexed: false },
            { name: "sharePriceE18", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "Withdrawn",
        inputs: [
            { name: "funder", type: "address", indexed: true },
            { name: "assets", type: "uint256", indexed: false },
            { name: "sharesBurned", type: "uint256", indexed: false },
            { name: "sharePriceE18", type: "uint256", indexed: false },
        ],
    },
];
// ============================================================================
// PREDICTION MARKET — Parimutuel betting on DAO proposals
// Lives on Ethereum mainnet so Nouns/Lil Nouns resolve trustlessly onchain.
// ============================================================================
exports.PREDICTION_MARKET_ADDRESS = "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608";
exports.PREDICTION_MARKET_ABI = [
    {
        type: "function",
        name: "isDaoResolvable",
        inputs: [{ name: "dao", type: "string" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "stake",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
            { name: "isFor", type: "bool" },
        ],
        outputs: [],
        stateMutability: "payable",
    },
    {
        type: "function",
        name: "claim",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        type: "function",
        name: "getMarket",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
        ],
        outputs: [
            { name: "forPool", type: "uint256" },
            { name: "againstPool", type: "uint256" },
            { name: "forStakers", type: "uint256" },
            { name: "againstStakers", type: "uint256" },
            { name: "forOddsBps", type: "uint256" },
            { name: "againstOddsBps", type: "uint256" },
            { name: "outcome", type: "uint8" },
            { name: "exists", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "function",
        name: "getPosition",
        inputs: [
            { name: "dao", type: "string" },
            { name: "proposalId", type: "string" },
            { name: "user", type: "address" },
        ],
        outputs: [
            { name: "forStake", type: "uint256" },
            { name: "againstStake", type: "uint256" },
            { name: "claimed", type: "bool" },
        ],
        stateMutability: "view",
    },
    {
        type: "event",
        name: "StakePlaced",
        inputs: [
            { name: "proposalKey", type: "bytes32", indexed: true },
            { name: "staker", type: "address", indexed: true },
            { name: "isFor", type: "bool", indexed: false },
            { name: "amount", type: "uint256", indexed: false },
        ],
    },
    {
        type: "event",
        name: "MarketResolved",
        inputs: [
            { name: "proposalKey", type: "bytes32", indexed: true },
            { name: "outcome", type: "uint8", indexed: false },
        ],
    },
    {
        type: "event",
        name: "WinningsClaimed",
        inputs: [
            { name: "proposalKey", type: "bytes32", indexed: true },
            { name: "staker", type: "address", indexed: true },
            { name: "payout", type: "uint256", indexed: false },
        ],
    },
];
