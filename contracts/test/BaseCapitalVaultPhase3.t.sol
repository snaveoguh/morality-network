// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BaseCapitalVault} from "../src/BaseCapitalVault.sol";
import {WithdrawalQueue} from "../src/WithdrawalQueue.sol";
import {MorphoReserveAllocator} from "../src/MorphoReserveAllocator.sol";
import {BridgeRouter} from "../src/BridgeRouter.sol";
import {ArbTransitEscrow} from "../src/ArbTransitEscrow.sol";
import {HLStrategyManager} from "../src/HLStrategyManager.sol";
import {NavReporter} from "../src/NavReporter.sol";
import {ExecutorAssetConverter} from "../src/ExecutorAssetConverter.sol";
import {ExecutorBridgeAdapter} from "../src/ExecutorBridgeAdapter.sol";

contract Phase3MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}

contract Phase3MockMorphoVault is ERC20, ERC4626 {
    constructor(ERC20 asset_) ERC20("Mock Morpho Vault", "mmWETH") ERC4626(asset_) {}

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return super.decimals();
    }
}

contract Phase3MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BaseCapitalVaultPhase3Test is Test {
    uint256 internal constant WETH_TO_USDC_RATE_E18 = 2_000e18;
    uint256 internal constant USDC_TO_WETH_RATE_E18 = 5e14; // 1 / 2000, exact

    BaseCapitalVault internal vault;
    WithdrawalQueue internal queue;
    MorphoReserveAllocator internal reserveAllocator;
    BridgeRouter internal bridgeRouter;
    ArbTransitEscrow internal arbEscrow;
    HLStrategyManager internal strategyManager;
    NavReporter internal navReporter;
    ExecutorAssetConverter internal assetConverter;
    ExecutorBridgeAdapter internal bridgeAdapter;
    Phase3MockWETH internal weth;
    Phase3MockMorphoVault internal morphoVault;
    Phase3MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal allocator = makeAddr("allocator");
    address internal reporter = makeAddr("reporter");
    address internal routerOperator = makeAddr("routerOperator");
    address internal bridgeExecutor = makeAddr("bridgeExecutor");
    address internal hlOperator = makeAddr("hlOperator");
    address internal strategyHotWallet = makeAddr("strategyHotWallet");
    address internal alice = makeAddr("alice");

    function setUp() public {
        weth = new Phase3MockWETH();
        morphoVault = new Phase3MockMorphoVault(ERC20(address(weth)));
        usdc = new Phase3MockUSDC();

        vm.startPrank(owner);

        BaseCapitalVault vaultImpl = new BaseCapitalVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeCall(
                BaseCapitalVault.initialize,
                ("Base Balanced Vault", "bbETH", owner, address(weth), bytes32("BALANCED"), 500, 4000, 2000, 4000)
            )
        );
        vault = BaseCapitalVault(payable(address(vaultProxy)));

        WithdrawalQueue queueImpl = new WithdrawalQueue();
        ERC1967Proxy queueProxy = new ERC1967Proxy(
            address(queueImpl),
            abi.encodeCall(WithdrawalQueue.initialize, (owner, address(vault)))
        );
        queue = WithdrawalQueue(address(queueProxy));

        MorphoReserveAllocator reserveImpl = new MorphoReserveAllocator();
        ERC1967Proxy reserveProxy = new ERC1967Proxy(
            address(reserveImpl),
            abi.encodeCall(MorphoReserveAllocator.initialize, (owner, address(vault), address(weth), address(morphoVault)))
        );
        reserveAllocator = MorphoReserveAllocator(address(reserveProxy));

        BridgeRouter bridgeImpl = new BridgeRouter();
        ERC1967Proxy bridgeProxy = new ERC1967Proxy(
            address(bridgeImpl),
            abi.encodeCall(
                BridgeRouter.initialize,
                (owner, address(vault), address(weth), routerOperator, bridgeExecutor, address(0))
            )
        );
        bridgeRouter = BridgeRouter(address(bridgeProxy));

        ArbTransitEscrow escrowImpl = new ArbTransitEscrow();
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl),
            abi.encodeCall(ArbTransitEscrow.initialize, (owner, address(usdc), bridgeExecutor, owner))
        );
        arbEscrow = ArbTransitEscrow(address(escrowProxy));

        HLStrategyManager strategyImpl = new HLStrategyManager();
        ERC1967Proxy strategyProxy = new ERC1967Proxy(
            address(strategyImpl),
            abi.encodeCall(
                HLStrategyManager.initialize,
                (owner, address(usdc), address(arbEscrow), hlOperator, strategyHotWallet)
            )
        );
        strategyManager = HLStrategyManager(address(strategyProxy));

        NavReporter navImpl = new NavReporter();
        ERC1967Proxy navProxy = new ERC1967Proxy(
            address(navImpl),
            abi.encodeCall(
                NavReporter.initialize,
                (owner, address(vault), address(reserveAllocator), address(bridgeRouter), reporter, uint64(1 days))
            )
        );
        navReporter = NavReporter(address(navProxy));

        ExecutorAssetConverter converterImpl = new ExecutorAssetConverter();
        ERC1967Proxy converterProxy = new ERC1967Proxy(
            address(converterImpl),
            abi.encodeCall(
                ExecutorAssetConverter.initialize,
                (ExecutorAssetConverter.InitParams({
                    owner: owner,
                    assetIn: address(weth),
                    bridgeAsset: address(usdc),
                    router: address(bridgeRouter),
                    bridgeAssetLiquidityProvider: owner,
                    vaultAssetLiquidityProvider: owner,
                    assetInSink: owner,
                    bridgeAssetSink: owner,
                    assetInDecimals: uint8(18),
                    bridgeAssetDecimals: uint8(6),
                    toBridgeRateE18: WETH_TO_USDC_RATE_E18,
                    toVaultRateE18: USDC_TO_WETH_RATE_E18
                }))
            )
        );
        assetConverter = ExecutorAssetConverter(address(converterProxy));

        ExecutorBridgeAdapter adapterImpl = new ExecutorBridgeAdapter();
        ERC1967Proxy adapterProxy = new ERC1967Proxy(
            address(adapterImpl),
            abi.encodeCall(ExecutorBridgeAdapter.initialize, (owner, address(usdc), address(bridgeRouter), bridgeExecutor))
        );
        bridgeAdapter = ExecutorBridgeAdapter(address(adapterProxy));

        vault.setAllocator(allocator);
        vault.setWithdrawalQueue(address(queue));
        vault.setReserveAllocator(address(reserveAllocator));
        vault.setBridgeRouter(address(bridgeRouter));
        vault.setNavReporter(address(navReporter));

        bridgeRouter.setArbEscrow(address(arbEscrow));
        bridgeRouter.setBridgeAsset(address(usdc));
        bridgeRouter.setAssetConverter(address(assetConverter));
        bridgeRouter.setBridgeAdapter(address(bridgeAdapter));

        arbEscrow.setStrategyManager(address(strategyManager));

        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(owner, 100 ether);

        weth.mint(owner, 100 ether);
        usdc.mint(owner, 10_000_000e6);

        vm.prank(owner);
        weth.approve(address(assetConverter), type(uint256).max);
        vm.prank(owner);
        usdc.approve(address(assetConverter), type(uint256).max);
        vm.prank(bridgeExecutor);
        usdc.approve(address(arbEscrow), type(uint256).max);
        vm.prank(bridgeExecutor);
        usdc.approve(address(bridgeAdapter), type(uint256).max);
    }

    function test_usdc_conversion_route_round_trip() public {
        vm.prank(alice);
        vault.depositETH{value: 10 ether}(alice);

        vm.prank(routerOperator);
        bytes32 routeId = bridgeRouter.bridgeToArbitrum(3 ether, bytes32("phase3-route"));

        assertEq(vault.liquidAssetsStored(), 7 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 3 ether);
        assertEq(usdc.balanceOf(bridgeExecutor), 6_000e6);

        vm.startPrank(bridgeExecutor);
        arbEscrow.receiveBridge(routeId, 6_000e6);
        bridgeRouter.markReceivedOnArbitrum(routeId);
        vm.stopPrank();

        vm.prank(hlOperator);
        strategyManager.releaseRouteToHotWallet(routeId, 6_000e6);
        assertEq(usdc.balanceOf(strategyHotWallet), 6_000e6);

        vm.prank(hlOperator);
        strategyManager.recordHyperliquidDeployment(routeId, 6_000e6, bytes32("hl-deploy"));

        vm.prank(bridgeExecutor);
        bridgeRouter.markStrategyFunded(routeId, bytes32("strategy-funded"));

        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 3 ether);

        vm.prank(strategyHotWallet);
        usdc.approve(address(strategyManager), 5_000e6);

        vm.prank(hlOperator);
        strategyManager.pullbackToTransitEscrow(routeId, 5_000e6, bytes32("hl-withdraw"));

        vm.prank(hlOperator);
        strategyManager.signalReturnToBase(routeId, 5_000e6, bytes32("return-ready"));

        vm.prank(bridgeExecutor);
        bridgeRouter.beginReturnFromStrategy(routeId, 2.5 ether, bytes32("return-begin"));

        vm.prank(bridgeExecutor);
        bridgeRouter.setReturnBridgeAssets(routeId, 5_000e6);

        vm.prank(bridgeExecutor);
        arbEscrow.releaseToBridge(routeId, 5_000e6, bridgeExecutor);

        vm.prank(bridgeExecutor);
        bridgeRouter.finalizeReturnToBase(routeId, bytes32("return-complete"));

        assertEq(vault.liquidAssetsStored(), 9.5 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 0.5 ether);
        assertEq(usdc.balanceOf(strategyHotWallet), 1_000e6);
        assertEq(weth.balanceOf(address(vault)), 9.5 ether);
    }

    function test_failed_route_converts_usdc_back_to_vault_asset() public {
        vm.prank(alice);
        vault.depositETH{value: 5 ether}(alice);

        vm.prank(routerOperator);
        bytes32 routeId = bridgeRouter.bridgeToArbitrum(2 ether, bytes32("phase3-fail"));

        assertEq(vault.liquidAssetsStored(), 3 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 2 ether);
        assertEq(usdc.balanceOf(bridgeExecutor), 4_000e6);

        vm.prank(bridgeExecutor);
        bridgeRouter.markFailedRoute(routeId, bytes32("bridge-failed"));

        assertEq(vault.liquidAssetsStored(), 5 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 0);
        assertEq(weth.balanceOf(address(vault)), 5 ether);
    }
}
