// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PooterImageVault} from "../src/PooterImageVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice Deploy PooterImageVault behind a UUPS proxy.
///
/// Required env:
///   PRIVATE_KEY — deployer/owner private key
///
/// Usage (Base Sepolia — dev only):
///   forge script script/DeployImageVault.s.sol:DeployImageVault \
///     --rpc-url base_sepolia --broadcast --verify
contract DeployImageVault is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy implementation
        PooterImageVault impl = new PooterImageVault();

        // 2. Deploy proxy with initialize() call
        bytes memory initData = abi.encodeCall(PooterImageVault.initialize, ());
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        console2.log("PooterImageVault impl:", address(impl));
        console2.log("PooterImageVault proxy:", address(proxy));
    }
}
