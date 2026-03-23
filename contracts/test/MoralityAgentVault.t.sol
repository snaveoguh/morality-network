// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityAgentVault.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityAgentVaultTest is Test {
    MoralityAgentVault internal vault;

    address internal manager = makeAddr("manager");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        MoralityAgentVault impl = new MoralityAgentVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(MoralityAgentVault.initialize, (manager, feeRecipient, 500))
        );
        vault = MoralityAgentVault(payable(address(proxy)));

        // Raise allocation cap to 75% for test coverage (default is 50%, max is 75%)
        vault.setMaxAllocationBps(7500);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(manager, 100 ether);
    }

    function test_depositMintsSharesAndTracksFunders() public {
        vm.prank(alice);
        uint256 minted = vault.deposit{value: 2 ether}();
        assertEq(minted, 2 ether);
        assertEq(vault.shareBalance(alice), 2 ether);
        assertEq(vault.totalShares(), 2 ether);

        vm.prank(bob);
        vault.deposit{value: 1 ether}();
        assertEq(vault.shareBalance(bob), 1 ether);
        assertEq(vault.totalShares(), 3 ether);
        assertEq(vault.getFunderCount(), 2);

        address[] memory funders = vault.getFunders(0, 10);
        assertEq(funders.length, 2);
        assertEq(funders[0], alice);
        assertEq(funders[1], bob);
    }

    function test_allocateAndSettleProfitPaysFee() public {
        vm.prank(alice);
        vault.deposit{value: 10 ether}();

        vm.prank(manager);
        vault.allocateToStrategy(payable(manager), 4 ether);

        assertEq(vault.deployedCapital(), 4 ether);
        assertEq(address(vault).balance, 6 ether);
        assertEq(vault.totalManagedAssets(), 10 ether);

        uint256 feeBefore = feeRecipient.balance;
        vm.prank(manager);
        vault.returnFromStrategy{value: 5 ether}();

        // 4 ETH principal + 1 ETH profit => 5% fee on 1 ETH = 0.05 ETH
        assertEq(vault.deployedCapital(), 0);
        assertEq(feeRecipient.balance, feeBefore + 0.05 ether);
        assertEq(vault.totalFeesPaid(), 0.05 ether);
        assertEq(vault.cumulativeStrategyProfit(), 1 ether);
        assertEq(address(vault).balance, 10.95 ether);
        assertEq(vault.totalManagedAssets(), 10.95 ether);
    }

    function test_reportLossReducesAumAndSnapshotPnl() public {
        vm.prank(alice);
        vault.deposit{value: 5 ether}();

        vm.prank(manager);
        vault.allocateToStrategy(payable(manager), 3 ether);

        vm.prank(manager);
        vault.reportStrategyLoss(1 ether, "slippage cascade");

        assertEq(vault.deployedCapital(), 2 ether);
        assertEq(vault.cumulativeStrategyLoss(), 1 ether);
        assertEq(vault.totalManagedAssets(), 4 ether); // 2 liquid + 2 deployed

        (,, uint256 deposited,, int256 pnl, int256 pnlBps) = vault.getFunderSnapshot(alice);
        assertEq(deposited, 5 ether);
        // Virtual offset introduces tiny rounding (<1000 wei) — use approx comparison
        assertApproxEqAbs(pnl, -1 ether, 1000);
        assertApproxEqAbs(pnlBps, -2000, 1); // -20.00% (±0.01%)
    }

    function test_withdrawRequiresLiquidity() public {
        vm.prank(alice);
        vault.deposit{value: 8 ether}();

        vm.prank(manager);
        vault.allocateToStrategy(payable(manager), 6 ether); // 75% of 8 ether

        assertEq(vault.maxWithdraw(alice), 2 ether);

        vm.prank(alice);
        vm.expectRevert("Insufficient liquid assets");
        vault.withdraw(3 ether);

        vm.prank(alice);
        vault.withdraw(2 ether);
        assertEq(address(vault).balance, 0);
    }

    function test_redeemBurnsSharesAndReturnsAssets() public {
        vm.prank(alice);
        vault.deposit{value: 3 ether}();

        uint256 sharesBefore = vault.shareBalance(alice);
        vm.prank(alice);
        uint256 assets = vault.redeem(1 ether);

        assertEq(assets, 1 ether);
        assertEq(vault.shareBalance(alice), sharesBefore - 1 ether);
        assertEq(alice.balance, 98 ether);
    }

    function test_onlyManagerCanMoveStrategyCapital() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();

        vm.prank(alice);
        vm.expectRevert("Not manager");
        vault.allocateToStrategy(payable(alice), 0.5 ether);

        vm.prank(alice);
        vm.expectRevert("Not manager");
        vault.returnFromStrategy{value: 0.1 ether}();

        vm.prank(alice);
        vm.expectRevert("Not manager");
        vault.reportStrategyLoss(0.1 ether, "bad trade");
    }

    function test_onlyOwnerCanUpdateFeeConfig() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vault.setPerformanceFeeBps(600);

        vault.setPerformanceFeeBps(600);
        assertEq(vault.performanceFeeBps(), 600);

        vm.expectRevert("Fee too high");
        vault.setPerformanceFeeBps(2_001);
    }

    function test_adminSettersAndPauseControls() public {
        address newManager = makeAddr("newManager");
        address newFeeRecipient = makeAddr("newFeeRecipient");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        vault.setManager(newManager);

        vault.setManager(newManager);
        vault.setFeeRecipient(newFeeRecipient);
        vault.setMaxAllocationBps(7500);

        assertEq(vault.manager(), newManager);
        assertEq(vault.feeRecipient(), newFeeRecipient);
        assertEq(vault.maxAllocationBps(), 7500);

        vm.prank(alice);
        vault.deposit{value: 2 ether}();

        vault.pause();

        vm.prank(bob);
        vm.expectRevert();
        vault.deposit{value: 1 ether}();

        vm.prank(newManager);
        vm.expectRevert();
        vault.allocateToStrategy(payable(newManager), 1 ether);

        vault.unpause();

        vm.prank(newManager);
        vault.allocateToStrategy(payable(newManager), 1 ether);
        assertEq(vault.deployedCapital(), 1 ether);
    }

    function test_setMaxAllocationBpsRejectsValuesAbove75Percent() public {
        vm.expectRevert("Max 75%");
        vault.setMaxAllocationBps(7_501);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        vault.initialize(manager, feeRecipient, 500);
    }
}
