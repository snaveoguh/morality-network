// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PooterEditions} from "../src/PooterEditions.sol";
import {PooterAuctions} from "../src/PooterAuctions.sol";

/// @notice Upgrades PooterEditions to V2 (minter role) and deploys PooterAuctions.
///
/// Required env:
///   PRIVATE_KEY            — deployer/owner private key
///   POOTER_EDITIONS_PROXY  — address of the existing PooterEditions proxy
///
/// Optional env:
///   TREASURY — auction proceeds recipient (default: Nouns small grants treasury)
contract DeployAuctions is Script {
    address internal constant DEFAULT_TREASURY = 0xBAc9233725440c595b19d975309CC98cb259253a;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address editionsProxy = vm.envAddress("POOTER_EDITIONS_PROXY");
        address treasury = vm.envOr("TREASURY", DEFAULT_TREASURY);

        vm.startBroadcast(deployerKey);

        // 1. Deploy new PooterEditions implementation and upgrade proxy
        PooterEditions newImpl = new PooterEditions();
        PooterEditions editions = PooterEditions(editionsProxy);
        editions.upgradeToAndCall(address(newImpl), "");

        // 2. Deploy PooterAuctions
        PooterAuctions auctions = new PooterAuctions(address(editions), treasury);

        // 3. Set auction contract as authorized minter
        editions.setMinter(address(auctions));

        vm.stopBroadcast();

        console2.log("PooterEditions V2 impl:", address(newImpl));
        console2.log("PooterAuctions:", address(auctions));
        console2.log("Treasury:", treasury);
    }
}
