// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ArbTransitEscrow} from "../src/ArbTransitEscrow.sol";
import {HLStrategyManager} from "../src/HLStrategyManager.sol";
import {DevUSDC} from "../src/DevUSDC.sol";

contract DeployVaultRailArb is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address owner = vm.envOr("VAULT_RAIL_OWNER", deployer);
        address bridgeAsset = vm.envOr("VAULT_RAIL_ARB_BRIDGE_ASSET", vm.envOr("VAULT_RAIL_BRIDGE_ASSET", address(0)));
        address bridgeExecutor = vm.envOr("VAULT_RAIL_BRIDGE_EXECUTOR", deployer);
        address hlOperator = vm.envOr("VAULT_RAIL_HL_OPERATOR", deployer);
        address strategyWallet = vm.envOr("VAULT_RAIL_STRATEGY_WALLET", deployer);
        bool deployDevBridgeAsset = vm.envOr("VAULT_RAIL_DEPLOY_DEV_BRIDGE_ASSET", false);

        vm.startBroadcast(deployerKey);

        if (bridgeAsset == address(0) || deployDevBridgeAsset) {
            DevUSDC devBridgeAsset = new DevUSDC(owner);
            bridgeAsset = address(devBridgeAsset);
            console2.log("DevUSDC:", bridgeAsset);
        }

        ArbTransitEscrow escrow = ArbTransitEscrow(address(new ERC1967Proxy(
            address(new ArbTransitEscrow()),
            abi.encodeCall(ArbTransitEscrow.initialize, (owner, bridgeAsset, bridgeExecutor, deployer))
        )));

        HLStrategyManager manager = HLStrategyManager(address(new ERC1967Proxy(
            address(new HLStrategyManager()),
            abi.encodeCall(HLStrategyManager.initialize, (owner, bridgeAsset, address(escrow), hlOperator, strategyWallet))
        )));

        escrow.setStrategyManager(address(manager));

        vm.stopBroadcast();

        console2.log("ArbTransitEscrow (proxy):", address(escrow));
        console2.log("HLStrategyManager (proxy):", address(manager));
    }
}
