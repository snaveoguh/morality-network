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
import {DevReserveVault} from "../src/DevReserveVault.sol";
import {DevUSDC} from "../src/DevUSDC.sol";

contract DeployVaultRailBase is Script {
    struct Config {
        address owner;
        address weth;
        address bridgeAsset;
        address morphoTarget;
        address routerOperator;
        address bridgeExecutor;
        address reporter;
        address bridgeAssetLiquidityProvider;
        address vaultAssetLiquidityProvider;
        address assetInSink;
        address bridgeAssetSink;
        address arbEscrow;
        bool deployDevReserve;
        bool deployDevBridgeAsset;
        string trancheName;
        string trancheSymbol;
        bytes32 trancheId;
        uint16 performanceFeeBps;
        uint16 reserveTargetBps;
        uint16 liquidTargetBps;
        uint16 hlTargetBps;
        uint64 minReportInterval;
        uint8 assetInDecimals;
        uint8 bridgeAssetDecimals;
        uint256 toBridgeRateE18;
        uint256 toVaultRateE18;
    }

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        Config memory cfg = _loadConfig(deployer);

        vm.startBroadcast(deployerKey);

        if (cfg.bridgeAsset == address(0) || cfg.deployDevBridgeAsset) {
            DevUSDC devBridgeAsset = new DevUSDC(cfg.owner);
            cfg.bridgeAsset = address(devBridgeAsset);
            console2.log("DevUSDC:", cfg.bridgeAsset);
        }

        BaseCapitalVault vault = BaseCapitalVault(payable(address(new ERC1967Proxy(
            address(new BaseCapitalVault()),
            abi.encodeCall(
                BaseCapitalVault.initialize,
                (
                    cfg.trancheName,
                    cfg.trancheSymbol,
                    cfg.owner,
                    cfg.weth,
                    cfg.trancheId,
                    cfg.performanceFeeBps,
                    cfg.reserveTargetBps,
                    cfg.liquidTargetBps,
                    cfg.hlTargetBps
                )
            )
        ))));

        WithdrawalQueue queue = WithdrawalQueue(address(new ERC1967Proxy(
            address(new WithdrawalQueue()),
            abi.encodeCall(WithdrawalQueue.initialize, (cfg.owner, address(vault)))
        )));

        if (cfg.morphoTarget == address(0) || cfg.deployDevReserve) {
            DevReserveVault devReserveVault = new DevReserveVault(cfg.weth, cfg.owner, "Dev Reserve Vault", "drvWETH");
            cfg.morphoTarget = address(devReserveVault);
            console2.log("DevReserveVault:", cfg.morphoTarget);
        }

        MorphoReserveAllocator reserveAllocator = MorphoReserveAllocator(address(new ERC1967Proxy(
            address(new MorphoReserveAllocator()),
            abi.encodeCall(MorphoReserveAllocator.initialize, (cfg.owner, address(vault), cfg.weth, cfg.morphoTarget))
        )));

        BridgeRouter bridgeRouter = BridgeRouter(address(new ERC1967Proxy(
            address(new BridgeRouter()),
            abi.encodeCall(
                BridgeRouter.initialize,
                (cfg.owner, address(vault), cfg.weth, cfg.routerOperator, cfg.bridgeExecutor, cfg.arbEscrow)
            )
        )));

        NavReporter navReporter = NavReporter(address(new ERC1967Proxy(
            address(new NavReporter()),
            abi.encodeCall(
                NavReporter.initialize,
                (
                    cfg.owner,
                    address(vault),
                    address(reserveAllocator),
                    address(bridgeRouter),
                    cfg.reporter,
                    cfg.minReportInterval
                )
            )
        )));

        ExecutorAssetConverter assetConverter = ExecutorAssetConverter(address(new ERC1967Proxy(
            address(new ExecutorAssetConverter()),
            abi.encodeCall(
                ExecutorAssetConverter.initialize,
                (ExecutorAssetConverter.InitParams({
                    owner: cfg.owner,
                    assetIn: cfg.weth,
                    bridgeAsset: cfg.bridgeAsset,
                    router: address(bridgeRouter),
                    bridgeAssetLiquidityProvider: cfg.bridgeAssetLiquidityProvider,
                    vaultAssetLiquidityProvider: cfg.vaultAssetLiquidityProvider,
                    assetInSink: cfg.assetInSink,
                    bridgeAssetSink: cfg.bridgeAssetSink,
                    assetInDecimals: cfg.assetInDecimals,
                    bridgeAssetDecimals: cfg.bridgeAssetDecimals,
                    toBridgeRateE18: cfg.toBridgeRateE18,
                    toVaultRateE18: cfg.toVaultRateE18
                }))
            )
        )));

        ExecutorBridgeAdapter bridgeAdapter = ExecutorBridgeAdapter(address(new ERC1967Proxy(
            address(new ExecutorBridgeAdapter()),
            abi.encodeCall(
                ExecutorBridgeAdapter.initialize,
                (cfg.owner, cfg.bridgeAsset, address(bridgeRouter), cfg.bridgeExecutor)
            )
        )));

        vault.setAllocator(cfg.routerOperator);
        vault.setWithdrawalQueue(address(queue));
        vault.setReserveAllocator(address(reserveAllocator));
        vault.setBridgeRouter(address(bridgeRouter));
        vault.setNavReporter(address(navReporter));

        bridgeRouter.setBridgeAsset(cfg.bridgeAsset);
        bridgeRouter.setAssetConverter(address(assetConverter));
        bridgeRouter.setBridgeAdapter(address(bridgeAdapter));
        if (cfg.arbEscrow != address(0)) {
            bridgeRouter.setArbEscrow(cfg.arbEscrow);
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

    function _loadConfig(address deployer) internal view returns (Config memory cfg) {
        cfg.owner = vm.envOr("VAULT_RAIL_OWNER", deployer);
        cfg.weth = vm.envAddress("VAULT_RAIL_WETH");
        cfg.bridgeAsset = vm.envOr("VAULT_RAIL_BASE_BRIDGE_ASSET", vm.envOr("VAULT_RAIL_BRIDGE_ASSET", address(0)));
        cfg.morphoTarget = vm.envOr("VAULT_RAIL_MORPHO_TARGET", address(0));
        cfg.routerOperator = vm.envOr("VAULT_RAIL_ROUTER_OPERATOR", deployer);
        cfg.bridgeExecutor = vm.envOr("VAULT_RAIL_BRIDGE_EXECUTOR", deployer);
        cfg.reporter = vm.envOr("VAULT_RAIL_REPORTER", deployer);
        cfg.bridgeAssetLiquidityProvider = vm.envOr("VAULT_RAIL_BRIDGE_ASSET_LP", deployer);
        cfg.vaultAssetLiquidityProvider = vm.envOr("VAULT_RAIL_VAULT_ASSET_LP", deployer);
        cfg.assetInSink = vm.envOr("VAULT_RAIL_ASSET_IN_SINK", cfg.owner);
        cfg.bridgeAssetSink = vm.envOr("VAULT_RAIL_BRIDGE_ASSET_SINK", cfg.owner);
        cfg.arbEscrow = vm.envOr("VAULT_RAIL_ARB_ESCROW", address(0));
        cfg.deployDevReserve = vm.envOr("VAULT_RAIL_DEPLOY_DEV_RESERVE", false);
        cfg.deployDevBridgeAsset = vm.envOr("VAULT_RAIL_DEPLOY_DEV_BRIDGE_ASSET", false);
        cfg.trancheName = vm.envOr("VAULT_RAIL_TRANCHE_NAME", string("Base Balanced Vault"));
        cfg.trancheSymbol = vm.envOr("VAULT_RAIL_TRANCHE_SYMBOL", string("bbETH"));
        cfg.trancheId = bytes32(bytes(vm.envOr("VAULT_RAIL_TRANCHE_ID", string("BALANCED"))));
        cfg.performanceFeeBps = uint16(vm.envOr("VAULT_RAIL_PERFORMANCE_FEE_BPS", uint256(500)));
        cfg.reserveTargetBps = uint16(vm.envOr("VAULT_RAIL_RESERVE_TARGET_BPS", uint256(4000)));
        cfg.liquidTargetBps = uint16(vm.envOr("VAULT_RAIL_LIQUID_TARGET_BPS", uint256(2000)));
        cfg.hlTargetBps = uint16(vm.envOr("VAULT_RAIL_HL_TARGET_BPS", uint256(4000)));
        cfg.minReportInterval = uint64(vm.envOr("VAULT_RAIL_MIN_REPORT_INTERVAL", uint256(1 days)));
        cfg.assetInDecimals = uint8(vm.envOr("VAULT_RAIL_ASSET_IN_DECIMALS", uint256(18)));
        cfg.bridgeAssetDecimals = uint8(vm.envOr("VAULT_RAIL_BRIDGE_ASSET_DECIMALS", uint256(6)));
        cfg.toBridgeRateE18 = vm.envUint("VAULT_RAIL_TO_BRIDGE_RATE_E18");
        cfg.toVaultRateE18 = vm.envUint("VAULT_RAIL_TO_VAULT_RATE_E18");
    }
}
