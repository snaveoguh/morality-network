// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Upgrade MoralityPredictionMarket proxy to new implementation.
///         Adds ownerResolve() and owner-managed market creation.
contract UpgradePredictionMarket is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address proxy = vm.envAddress("PREDICTION_MARKET_PROXY");

        vm.startBroadcast(deployerKey);

        // Deploy new implementation
        MoralityPredictionMarket newImpl = new MoralityPredictionMarket();

        // Upgrade proxy to new implementation (no initialization needed — storage compatible)
        UUPSUpgradeable(proxy).upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console2.log("New implementation:", address(newImpl));
        console2.log("Proxy upgraded:", proxy);
    }
}
