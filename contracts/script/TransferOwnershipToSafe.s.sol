// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

interface IOwnable {
    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

/// @title TransferOwnershipToSafe
/// @notice Moves `owner()` of every pooter.world proxy on Base (and the L1 market)
///         from the trader hot-wallet EOA to a multisig. One-step OZ Ownable
///         transfer — IRREVERSIBLE once broadcast. Read the checklist below first.
///
/// Why: audit 2026-09-06 — all nine mainnet proxies are owned by 0x38501DEB…764d,
/// the Hyperliquid trader key held in a Railway env var. One key compromise =
/// every contract upgradeable to arbitrary code.
///
/// Checklist before --broadcast:
///  1. NEW_OWNER must be a Safe YOU control with threshold >= 2 (the nocguild
///     Safe 0xada31add… is 1-of-4 with three owners we could not identify — do
///     NOT use it as-is).
///  2. Dry-run first (no --broadcast) and read the printed owner() for each
///     target; every one must equal the current EOA.
///  3. Run once per chain with the matching RPC + CHAIN_ID; the same addresses
///     hold DIFFERENT contracts on Base vs Ethereum (same deployer nonce).
///  4. Sign with the current owner key via `--private-key` supplied by the
///     shell (never paste it into a file, never commit it).
///
/// Usage:
///   CHAIN_ID=8453 NEW_OWNER=0x... forge script script/TransferOwnershipToSafe.s.sol \
///     --rpc-url $BASE_RPC --private-key $OWNER_KEY --broadcast -vvv
///   CHAIN_ID=1 NEW_OWNER=0x... forge script ... --rpc-url $ETH_RPC ...
contract TransferOwnershipToSafe is Script {
    address constant CURRENT_OWNER = 0x38501DEB0984E651fE5275359904C76e6F7f764d;

    function _targets(uint256 chainId) internal pure returns (address[] memory t, string[] memory names) {
        if (chainId == 8453) {
            t = new address[](9);
            names = new string[](9);
            t[0] = 0x2ea7502C4db5B8cfB329d8a9866EB6705b036608; names[0] = "MoralityRegistry";
            t[1] = 0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405; names[1] = "MoralityRatings";
            t[2] = 0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b; names[2] = "MoralityComments";
            t[3] = 0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B; names[3] = "MoralityTipping";
            t[4] = 0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6; names[4] = "MoralityLeaderboard";
            t[5] = 0x4B48d35E019129bb5a16920ADC4Cb7F445ec8cA5; names[5] = "MoralityAgentVault";
            t[6] = 0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e; names[6] = "PooterEditions";
            t[7] = 0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f; names[7] = "PooterAuctions";
            t[8] = 0x71b2e273727385C617fe254f4fB14a36a679b12A; names[8] = "MoralityPredictionMarket (Base)";
        } else if (chainId == 1) {
            t = new address[](1);
            names = new string[](1);
            t[0] = 0x2ea7502C4db5B8cfB329d8a9866EB6705b036608; names[0] = "MoralityPredictionMarket (L1)";
        } else {
            revert("unsupported CHAIN_ID");
        }
    }

    function run() external {
        uint256 chainId = vm.envUint("CHAIN_ID");
        address newOwner = vm.envAddress("NEW_OWNER");
        require(block.chainid == chainId, "RPC chain != CHAIN_ID");
        require(newOwner != address(0) && newOwner != CURRENT_OWNER, "bad NEW_OWNER");
        require(newOwner.code.length > 0, "NEW_OWNER must be a contract (Safe)");

        (address[] memory targets, string[] memory names) = _targets(chainId);

        // Pre-flight: every target must currently be owned by the EOA we sign with.
        for (uint256 i = 0; i < targets.length; i++) {
            address o = IOwnable(targets[i]).owner();
            console2.log(names[i], targets[i], "owner:", o);
            require(o == CURRENT_OWNER, "unexpected current owner - stop");
        }

        vm.startBroadcast();
        for (uint256 i = 0; i < targets.length; i++) {
            IOwnable(targets[i]).transferOwnership(newOwner);
        }
        vm.stopBroadcast();

        for (uint256 i = 0; i < targets.length; i++) {
            require(IOwnable(targets[i]).owner() == newOwner, "transfer did not take");
            console2.log("OK", names[i], "->", newOwner);
        }
    }
}
