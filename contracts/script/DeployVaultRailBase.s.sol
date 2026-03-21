// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BaseCapitalVault} from "../src/BaseCapitalVault.sol";
import {WithdrawalQueue} from "../src/WithdrawalQueue.sol";
import {MorphoReserveAllocator} from "../src/MorphoReserveAllocator.sol";
import {BridgeRouter} from "../src/BridgeRouter.sol";
import {NavReporter} from "../src/NavReporter.sol";
import {ExecutorAssetConverter} from "../src/ExecutorAssetConverter.sol";
import {ExecutorBridgeAdapter} from "../src/ExecutorBridgeAdapter.sol";

contract DeployVaultRailBase is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address owner = vm.envOr("VAULT_RAIL_OWNER", deployer);
        address weth = vm.envAddress("VAULT_RAIL_WETH");
        address bridgeAsset = vm.envAddress("VAULT_RAIL_BRIDGE_ASSET");
        address morphoTarget = vm.envAddress("VAULT_RAIL_MORPHO_TARGET");
        address routerOperator = vm.envOr("VAULT_RAIL_ROUTER_OPERATOR", deployer);
        address bridgeExecutor = vm.envOr("VAULT_RAIL_BRIDGE_EXECUTOR", deployer);
        address reporter = vm.envOr("VAULT_RAIL_REPORTER", deployer);
        address bridgeAssetLiquidityProvider = vm.envOr("VAULT_RAIL_BRIDGE_ASSET_LP", deployer);
        address vaultAssetLiquidityProvider = vm.envOr("VAULT_RAIL_VAULT_ASSET_LP", deployer);
        address assetInSink = vm.envOr("VAULT_RAIL_ASSET_IN_SINK", owner);
        address bridgeAssetSink = vm.envOr("VAULT_RAIL_BRIDGE_ASSET_SINK", owner);
        address arbEscrow = vm.envOr("VAULT_RAIL_ARB_ESCROW", address(0));

        string memory trancheName = vm.envOr("VAULT_RAIL_TRANCHE_NAME", string("Base Balanced Vault"));
        string memory trancheSymbol = vm.envOr("VAULT_RAIL_TRANCHE_SYMBOL", string("bbETH"));
        bytes32 trancheId = bytes32(bytes(vm.envOr("VAULT_RAIL_TRANCHE_ID", string("BALANCED"))));

        uint16 performanceFeeBps = uint16(vm.envOr("VAULT_RAIL_PERFORMANCE_FEE_BPS", uint256(500)));
        uint16 reserveTargetBps = uint16(vm.envOr("VAULT_RAIL_RESERVE_TARGET_BPS", uint256(4000)));
        uint16 liquidTargetBps = uint16(vm.envOr("VAULT_RAIL_LIQUID_TARGET_BPS", uint256(2000)));
        uint16 hlTargetBps = uint16(vm.envOr("VAULT_RAIL_HL_TARGET_BPS", uint256(4000)));
        uint64 minReportInterval = uint64(vm.envOr("VAULT_RAIL_MIN_REPORT_INTERVAL", uint256(1 days)));

        uint8 assetInDecimals = uint8(vm.envOr("VAULT_RAIL_ASSET_IN_DECIMALS", uint256(18)));
        uint8 bridgeAssetDecimals = uint8(vm.envOr("VAULT_RAIL_BRIDGE_ASSET_DECIMALS", uint256(6)));
        uint256 toBridgeRateE18 = vm.envUint("VAULT_RAIL_TO_BRIDGE_RATE_E18");
        uint256 toVaultRateE18 = vm.envUint("VAULT_RAIL_TO_VAULT_RATE_E18");

        vm.startBroadcast(deployerKey);

        BaseCapitalVault vault = BaseCapitalVault(payable(address(new ERC1967Proxy(
            address(new BaseCapitalVault()),
            abi.encodeCall(
                BaseCapitalVault.initialize,
                (trancheName, trancheSymbol, owner, weth, trancheId, performanceFeeBps, reserveTargetBps, liquidTargetBps, hlTargetBps)
            )
        ))));

        WithdrawalQueue queue = WithdrawalQueue(address(new ERC1967Proxy(
            address(new WithdrawalQueue()),
            abi.encodeCall(WithdrawalQueue.initialize, (owner, address(vault)))
        )));

        MorphoReserveAllocator reserveAllocator = MorphoReserveAllocator(address(new ERC1967Proxy(
            address(new MorphoReserveAllocator()),
            abi.encodeCall(MorphoReserveAllocator.initialize, (owner, address(vault), weth, morphoTarget))
        )));

        BridgeRouter bridgeRouter = BridgeRouter(address(new ERC1967Proxy(
            address(new BridgeRouter()),
            abi.encodeCall(BridgeRouter.initialize, (owner, address(vault), weth, routerOperator, bridgeExecutor, arbEscrow))
        )));

        NavReporter navReporter = NavReporter(address(new ERC1967Proxy(
            address(new NavReporter()),
            abi.encodeCall(
                NavReporter.initialize,
                (owner, address(vault), address(reserveAllocator), address(bridgeRouter), reporter, minReportInterval)
            )
        )));

        ExecutorAssetConverter assetConverter = ExecutorAssetConverter(address(new ERC1967Proxy(
            address(new ExecutorAssetConverter()),
            abi.encodeCall(
                ExecutorAssetConverter.initialize,
                (ExecutorAssetConverter.InitParams({
                    owner: owner,
                    assetIn: weth,
                    bridgeAsset: bridgeAsset,
                    router: address(bridgeRouter),
                    bridgeAssetLiquidityProvider: bridgeAssetLiquidityProvider,
                    vaultAssetLiquidityProvider: vaultAssetLiquidityProvider,
                    assetInSink: assetInSink,
                    bridgeAssetSink: bridgeAssetSink,
                    assetInDecimals: assetInDecimals,
                    bridgeAssetDecimals: bridgeAssetDecimals,
                    toBridgeRateE18: toBridgeRateE18,
                    toVaultRateE18: toVaultRateE18
                }))
            )
        )));

        ExecutorBridgeAdapter bridgeAdapter = ExecutorBridgeAdapter(address(new ERC1967Proxy(
            address(new ExecutorBridgeAdapter()),
            abi.encodeCall(ExecutorBridgeAdapter.initialize, (owner, bridgeAsset, address(bridgeRouter), bridgeExecutor))
        )));

        vault.setAllocator(routerOperator);
        vault.setWithdrawalQueue(address(queue));
        vault.setReserveAllocator(address(reserveAllocator));
        vault.setBridgeRouter(address(bridgeRouter));
        vault.setNavReporter(address(navReporter));

        bridgeRouter.setBridgeAsset(bridgeAsset);
        bridgeRouter.setAssetConverter(address(assetConverter));
        bridgeRouter.setBridgeAdapter(address(bridgeAdapter));
        if (arbEscrow != address(0)) {
            bridgeRouter.setArbEscrow(arbEscrow);
        }

        vm.stopBroadcast();

        console2.log("BaseCapitalVault (proxy):", address(vault));
        console2.log("WithdrawalQueue (proxy):", address(queue));
        console2.log("MorphoReserveAllocator (proxy):", address(reserveAllocator));
        console2.log("BridgeRouter (proxy):", address(bridgeRouter));
        console2.log("NavReporter (proxy):", address(navReporter));
        console2.log("ExecutorAssetConverter (proxy):", address(assetConverter));
        console2.log("ExecutorBridgeAdapter (proxy):", address(bridgeAdapter));
    }
}
