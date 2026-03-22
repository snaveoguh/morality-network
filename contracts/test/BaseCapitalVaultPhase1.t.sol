// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {BaseCapitalVault} from "../src/BaseCapitalVault.sol";
import {WithdrawalQueue} from "../src/WithdrawalQueue.sol";
import {MorphoReserveAllocator} from "../src/MorphoReserveAllocator.sol";

contract MockWETH is ERC20 {
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

contract MockMorphoVault is ERC20, ERC4626 {
    constructor(ERC20 asset_) ERC20("Mock Morpho Vault", "mmWETH") ERC4626(asset_) {}

    function decimals() public view override(ERC20, ERC4626) returns (uint8) {
        return super.decimals();
    }

    function addYield(uint256 assets) external {
        ERC20(address(asset())).transferFrom(msg.sender, address(this), assets);
    }
}

contract BaseCapitalVaultPhase1Test is Test {
    BaseCapitalVault internal vault;
    WithdrawalQueue internal queue;
    MorphoReserveAllocator internal reserveAllocator;
    MockWETH internal weth;
    MockMorphoVault internal morphoVault;

    address internal owner = makeAddr("owner");
    address internal allocator = makeAddr("allocator");
    address internal navReporter = makeAddr("navReporter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        weth = new MockWETH();
        morphoVault = new MockMorphoVault(ERC20(address(weth)));

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
        ERC1967Proxy allocatorProxy = new ERC1967Proxy(
            address(allocatorImpl),
            abi.encodeCall(MorphoReserveAllocator.initialize, (owner, address(vault), address(weth), address(morphoVault)))
        );
        reserveAllocator = MorphoReserveAllocator(address(allocatorProxy));

        vault.setAllocator(allocator);
        vault.setNavReporter(navReporter);
        vault.setWithdrawalQueue(address(queue));
        vault.setReserveAllocator(address(reserveAllocator));

        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(owner, 100 ether);
    }

    function test_depositEthMintsSharesAndTracksLiquidAssets() public {
        vm.prank(alice);
        uint256 shares = vault.depositETH{value: 5 ether}(alice);

        assertEq(shares, 5 ether);
        assertEq(vault.balanceOf(alice), 5 ether);
        assertEq(vault.totalSupply(), 5 ether);
        assertEq(vault.totalAssets(), 5 ether);
        assertEq(vault.liquidAssetsStored(), 5 ether);
        assertEq(weth.balanceOf(address(vault)), 5 ether);
    }

    function test_requestAndFulfillQueuedWithdrawal() public {
        vm.prank(alice);
        vault.depositETH{value: 5 ether}(alice);

        vm.prank(alice);
        uint256 requestId = vault.requestWithdraw(2 ether, alice);

        assertEq(vault.balanceOf(alice), 3 ether);
        assertEq(vault.balanceOf(address(queue)), 2 ether);

        (
            address requestOwner,
            address receiver,
            uint256 shares,
            uint256 assetsRequested,
            ,
            ,
            bool finalizedBefore
        ) = queue.getRequest(requestId);

        assertEq(requestOwner, alice);
        assertEq(receiver, alice);
        assertEq(shares, 2 ether);
        assertEq(assetsRequested, 2 ether);
        assertFalse(finalizedBefore);

        vm.prank(allocator);
        vault.fulfillWithdrawalRequest(requestId);

        (, , , , uint256 assetsFulfilled, , bool finalizedAfter) = queue.getRequest(requestId);
        assertEq(assetsFulfilled, 2 ether);
        assertTrue(finalizedAfter);
        assertEq(vault.balanceOf(address(queue)), 0);
        assertEq(vault.liquidAssetsStored(), 3 ether);
        assertEq(alice.balance, 95 ether);
        assertEq(weth.balanceOf(alice), 2 ether);
    }

    function test_allocateToReserveAndDeallocateWithYield() public {
        vm.prank(alice);
        vault.depositETH{value: 10 ether}(alice);

        vm.prank(allocator);
        vault.allocateToReserve(4 ether);

        assertEq(vault.liquidAssetsStored(), 6 ether);
        assertEq(vault.reserveAssetsStored(), 4 ether);
        assertEq(weth.balanceOf(address(vault)), 6 ether);
        assertEq(reserveAllocator.totalManagedAssets(), 4 ether);

        weth.mint(address(this), 1 ether);
        weth.approve(address(morphoVault), 1 ether);
        morphoVault.addYield(1 ether);

        uint256 available = reserveAllocator.liquidatableAssets();
        vm.prank(allocator);
        uint256 assetsOut = vault.deallocateFromReserve(available);

        assertApproxEqAbs(assetsOut, 5 ether, 1);
        assertEq(vault.reserveAssetsStored(), 0);
        assertApproxEqAbs(vault.liquidAssetsStored(), 11 ether, 1);
        assertEq(reserveAllocator.totalManagedAssets(), 0);
        assertApproxEqAbs(weth.balanceOf(address(vault)), 11 ether, 1);
    }

    function test_bridgeAndNavBucketAccounting() public {
        vm.prank(alice);
        vault.depositETH{value: 10 ether}(alice);

        vm.prank(allocator);
        vault.markBridgeOut(2 ether, keccak256("route-1"));
        assertEq(vault.liquidAssetsStored(), 8 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 2 ether);

        vm.prank(allocator);
        vault.markStrategyIncrease(2 ether, keccak256("settle-1"));
        assertEq(vault.pendingBridgeAssetsStored(), 0);
        assertEq(vault.hlStrategyAssetsStored(), 2 ether);

        vm.prank(navReporter);
        vault.settleDailyNav(3 ether, 1 ether, 0.5 ether, 0.1 ether, keccak256("nav-1"));

        assertEq(vault.reserveAssetsStored(), 1 ether);
        assertEq(vault.pendingBridgeAssetsStored(), 0.5 ether);
        assertEq(vault.hlStrategyAssetsStored(), 3 ether);
        assertEq(vault.accruedFeesEth(), 0.1 ether);
        assertEq(vault.totalAssets(), 12.4 ether);
        assertApproxEqAbs(vault.sharePriceE18(), 1.24 ether, 1000);
    }

    function test_onlyConfiguredRolesCanMutateStrategyState() public {
        vm.prank(alice);
        vault.depositETH{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert("Not allocator");
        vault.allocateToReserve(0.5 ether);

        vm.prank(alice);
        vm.expectRevert("Not nav reporter");
        vault.settleDailyNav(0, 0, 0, 0, bytes32(0));

        vm.prank(alice);
        vm.expectRevert("Not vault");
        queue.enqueue(alice, alice, 1 ether, 1 ether);

        vm.prank(alice);
        vm.expectRevert("Not vault");
        reserveAllocator.deposit(1 ether);
    }
}
