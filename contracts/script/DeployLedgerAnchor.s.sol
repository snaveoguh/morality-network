// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LedgerAnchor.sol";

/// @notice Deploys the Claim Ledger daily-root anchor to Base.
///         Reads PRIVATE_KEY (deployer, pays gas once) and
///         LEDGER_ANCHOR_OPERATOR (the only address allowed to anchor roots —
///         the web cron's dedicated key) from the environment.
/// Usage:
///   cd contracts && source .env && \
///   LEDGER_ANCHOR_OPERATOR=0x... forge script script/DeployLedgerAnchor.s.sol \
///     --rpc-url "$BASE_RPC_URL" --broadcast
contract DeployLedgerAnchor is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("LEDGER_ANCHOR_OPERATOR");

        vm.startBroadcast(deployerKey);
        LedgerAnchor anchor = new LedgerAnchor(operator);
        vm.stopBroadcast();

        console.log("LedgerAnchor deployed:", address(anchor));
        console.log("operator:", anchor.operator());
    }
}
