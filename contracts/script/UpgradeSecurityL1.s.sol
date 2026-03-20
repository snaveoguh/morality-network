// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MoralityPredictionMarket} from "../src/MoralityPredictionMarket.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Upgrade MoralityPredictionMarket proxy on Ethereum mainnet.
///         Adds PausableUpgradeable, ReentrancyGuard, removes receive().
///         Storage compatible — no new sequential slots.
contract UpgradeSecurityL1 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address proxy = vm.envAddress("PREDICTION_MARKET_PROXY");

        vm.startBroadcast(deployerKey);

        MoralityPredictionMarket newImpl = new MoralityPredictionMarket();
        UUPSUpgradeable(proxy).upgradeToAndCall(address(newImpl), "");

        console2.log("New implementation:", address(newImpl));
        console2.log("Proxy upgraded:", proxy);

        vm.stopBroadcast();
    }
}
