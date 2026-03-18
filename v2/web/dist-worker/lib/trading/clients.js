"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTraderClients = createTraderClients;
const accounts_1 = require("viem/accounts");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
function createTraderClients(config) {
    const account = (0, accounts_1.privateKeyToAccount)(config.privateKey);
    const chain = config.executionVenue === "ethereum-spot" ? chains_1.mainnet : chains_1.base;
    const publicClient = (0, viem_1.createPublicClient)({
        chain,
        transport: (0, viem_1.http)(config.rpcUrl, { timeout: 12_000 }),
    });
    const walletClient = (0, viem_1.createWalletClient)({
        chain,
        account,
        transport: (0, viem_1.http)(config.rpcUrl, { timeout: 12_000 }),
    });
    return {
        account,
        address: account.address,
        publicClient,
        walletClient,
    };
}
