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

contract Phase2MockWETH is ERC20 {
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

contract Phase2MockMorphoVault is ERC20, ERC4626 {
    constructor(ERC20 asset_) ERC20("Mock Morpho Vault", "mmWETH") ERC4626(asset_) {}

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return super.decimals();
    }

    function addYield(uint256 assets) external {
        ERC20(address(asset())).transferFrom(msg.sender, address(this), assets);
    }
}

contract BaseCapitalVaultPhase2Test is Test {
    BaseCapitalVault internal vault;
    WithdrawalQueue internal queue;
    MorphoReserveAllocator internal reserveAllocator;
    BridgeRouter internal bridgeRouter;
    ArbTransitEscrow internal arbEscrow;
    HLStrategyManager internal strategyManager;
    NavReporter internal navReporter;
    Phase2MockWETH internal weth;
    Phase2MockMorphoVault internal morphoVault;

    address internal owner = makeAddr("owner");
    address internal allocator = makeAddr("allocator");
    address internal reporter = makeAddr("reporter");
    address internal routerOperator = makeAddr("routerOperator");
    address internal bridgeExecutor = makeAddr("bridgeExecutor");
    address internal hlOperator = makeAddr("hlOperator");
    address internal strategyHotWallet = makeAddr("strategyHotWallet");
    address internal alice = makeAddr("alice");

    function setUp() public {
        weth = new Phase2MockWETH();
        morphoVault = new Phase2MockMorphoVault(ERC20(address(weth)));

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

        MorphoReserveAllocator allocatorImpl = new MorphoReserveAllocator();
        ERC1967Proxy reserveProxy = new ERC1967Proxy(
            address(allocatorImpl),
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
            abi.encodeCall(ArbTransitEscrow.initialize, (owner, address(weth), bridgeExecutor, owner))
        );
        arbEscrow = ArbTransitEscrow(address(escrowProxy));

        HLStrategyManager strategyImpl = new HLStrategyManager();
        ERC1967Proxy strategyProxy = new ERC1967Proxy(
            address(strategyImpl),
            abi.encodeCall(
                HLStrategyManager.initialize,
                (owner, address(weth), address(arbEscrow), hlOperator, strategyHotWallet)
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

        vault.setAllocator(allocator);
        vault.setWithdrawalQueue(address(queue));
        vault.setReserveAllocator(address(reserveAllocator));
        vault.setBridgeRouter(address(bridgeRouter));
        vault.setNavReporter(address(navReporter));

        bridgeRouter.setArbEscrow(address(arbEscrow));
        arbEscrow.setStrategyManager(address(strategyManager));

        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(owner, 100 ether);
        vm.deal(bridgeExecutor, 100 ether);
    }

    function test_bridge_route_round_trip_updates_vault_buckets() public {
        vm.prank(alice);
        vault.depositETH{value: 10 ether}(alice);

        vm.prank(routerOperator);
        bytes32 routeId = bridgeRouter.bridgeToArbitrum(3 ether, bytes32("hl-route-1"));

        assertEq(vault.liquidAssetsStored(), 7 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 3 ether);
        assertEq(weth.balanceOf(bridgeExecutor), 3 ether);

        vm.startPrank(bridgeExecutor);
        weth.approve(address(arbEscrow), 3 ether);
        arbEscrow.receiveBridge(routeId, 3 ether);
        bridgeRouter.markReceivedOnArbitrum(routeId);
        vm.stopPrank();

        vm.prank(hlOperator);
        strategyManager.releaseRouteToHotWallet(routeId, 3 ether);
        assertEq(weth.balanceOf(strategyHotWallet), 3 ether);

        vm.prank(hlOperator);
        strategyManager.recordHyperliquidDeployment(routeId, 3 ether, bytes32("hl-deposit"));

        vm.prank(bridgeExecutor);
        bridgeRouter.markStrategyFunded(routeId, bytes32("strategy-funded"));

        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 3 ether);
        assertEq(bridgeRouter.totalPendingAssets(), 0);

        vm.prank(strategyHotWallet);
        weth.approve(address(strategyManager), 3 ether);

        vm.prank(hlOperator);
        strategyManager.pullbackToTransitEscrow(routeId, 3 ether, bytes32("hl-withdraw"));

        vm.prank(hlOperator);
        strategyManager.signalReturnToBase(routeId, 3 ether, bytes32("return-ready"));

        vm.prank(bridgeExecutor);
        bridgeRouter.beginReturnFromStrategy(routeId, 3 ether, bytes32("return-begin"));

        assertEq(vault.hlStrategyAssetsStored(), 0);
        assertEq(vault.pendingBridgeAssetsStored(), 3 ether);
        assertEq(bridgeRouter.totalPendingAssets(), 3 ether);

        vm.startPrank(bridgeExecutor);
        arbEscrow.releaseToBridge(routeId, 3 ether, bridgeExecutor);
        weth.approve(address(bridgeRouter), 3 ether);
        bridgeRouter.finalizeReturnToBase(routeId, bytes32("return-complete"));
        vm.stopPrank();

        assertEq(vault.liquidAssetsStored(), 10 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 0);
        assertEq(bridgeRouter.totalPendingAssets(), 0);

        (, uint256 returnAssets, , , uint8 status, ) = bridgeRouter.getRoute(routeId);
        assertEq(returnAssets, 3 ether);
        assertEq(status, 5);
    }

    function test_nav_reporter_derives_reserve_and_pending_balances() public {
        vm.prank(alice);
        vault.depositETH{value: 10 ether}(alice);

        vm.prank(allocator);
        vault.allocateToReserve(4 ether);

        vm.prank(routerOperator);
        bytes32 routeId = bridgeRouter.bridgeToArbitrum(2 ether, bytes32("hl-route-2"));

        vm.startPrank(bridgeExecutor);
        weth.approve(address(arbEscrow), 2 ether);
        arbEscrow.receiveBridge(routeId, 2 ether);
        bridgeRouter.markReceivedOnArbitrum(routeId);
        vm.stopPrank();

        vm.prank(hlOperator);
        strategyManager.releaseRouteToHotWallet(routeId, 2 ether);

        vm.prank(hlOperator);
        strategyManager.recordHyperliquidDeployment(routeId, 2 ether, bytes32("hl-deploy-2"));

        vm.prank(bridgeExecutor);
        bridgeRouter.markStrategyFunded(routeId, bytes32("strategy-funded-2"));

        weth.mint(address(this), 1 ether);
        weth.approve(address(morphoVault), 1 ether);
        morphoVault.addYield(1 ether);

        vm.prank(reporter);
        navReporter.reportNav(2.5 ether, 0.1 ether, bytes32("nav-day-1"));

        assertEq(vault.liquidAssetsStored(), 4 ether);
        assertApproxEqAbs(vault.reserveAssetsStored(), 5 ether, 1);
        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 2.5 ether);
        assertEq(vault.accruedFeesEth(), 0.1 ether);
        assertApproxEqAbs(vault.totalAssets(), 11.4 ether, 1);
        assertApproxEqAbs(vault.sharePriceE18(), 1.14 ether, 1e9);
    }
}
