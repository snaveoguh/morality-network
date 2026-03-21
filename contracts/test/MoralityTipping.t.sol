// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityRegistry.sol";
import "../src/MoralityComments.sol";
import "../src/MoralityTipping.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityTippingTest is Test {
    MoralityRegistry internal registry;
    MoralityComments internal comments;
    MoralityTipping internal tipping;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal charlie = makeAddr("charlie");

    string internal constant IDENTIFIER = "https://example.com/entity";
    bytes32 internal constant UNREGISTERED_ENTITY = keccak256("entity:unregistered");

    function setUp() public {
        MoralityRegistry registryImpl = new MoralityRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(MoralityRegistry.initialize, ())
        );
        registry = MoralityRegistry(address(registryProxy));

        MoralityComments commentsImpl = new MoralityComments();
        ERC1967Proxy commentsProxy = new ERC1967Proxy(
            address(commentsImpl),
            abi.encodeCall(MoralityComments.initialize, ())
        );
        comments = MoralityComments(address(commentsProxy));

        MoralityTipping tippingImpl = new MoralityTipping();
        ERC1967Proxy tippingProxy = new ERC1967Proxy(
            address(tippingImpl),
            abi.encodeCall(MoralityTipping.initialize, (address(registry), address(comments)))
        );
        tipping = MoralityTipping(payable(address(tippingProxy)));
        comments.setTippingContract(address(tipping));

        vm.deal(alice, 20 ether);
        vm.deal(bob, 20 ether);
        vm.deal(charlie, 20 ether);
    }

    function test_tipEntityClaimedOwnerCreditsBalanceAndEmits() public {
        bytes32 entityHash = _registerEntityAs(alice);

        registry.approveOwnershipClaim(entityHash, alice);
        vm.prank(alice);
        registry.claimOwnership(entityHash);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(tipping));
        emit MoralityTipping.TipSent(entityHash, bob, alice, 1 ether);
        tipping.tipEntity{value: 1 ether}(entityHash);

        assertEq(tipping.entityTipTotals(entityHash), 1 ether);
        assertEq(tipping.balances(alice), 1 ether);
        assertEq(tipping.totalTipsGiven(bob), 1 ether);
        assertEq(tipping.totalTipsReceived(alice), 1 ether);
        assertEq(tipping.escrow(entityHash), 0);
    }

    function test_tipEntityUnclaimedEscrowsThenClaimed() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(tipping));
        emit MoralityTipping.TipEscrowed(entityHash, bob, 0.75 ether);
        tipping.tipEntity{value: 0.75 ether}(entityHash);

        assertEq(tipping.escrow(entityHash), 0.75 ether);
        assertEq(tipping.balances(alice), 0);

        vm.prank(charlie);
        vm.expectRevert("Not the owner");
        tipping.claimEscrow(entityHash);

        registry.approveOwnershipClaim(entityHash, alice);
        vm.prank(alice);
        registry.claimOwnership(entityHash);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(tipping));
        emit MoralityTipping.EscrowClaimed(entityHash, alice, 0.75 ether);
        tipping.claimEscrow(entityHash);

        assertEq(tipping.escrow(entityHash), 0);
        assertEq(tipping.balances(alice), 0.75 ether);
        assertEq(tipping.totalTipsReceived(alice), 0.75 ether);
    }

    function test_tipEntityUnregisteredEscrows() public {
        vm.prank(bob);
        tipping.tipEntity{value: 0.2 ether}(UNREGISTERED_ENTITY);

        assertEq(tipping.entityTipTotals(UNREGISTERED_ENTITY), 0.2 ether);
        assertEq(tipping.escrow(UNREGISTERED_ENTITY), 0.2 ether);
        assertEq(tipping.balances(alice), 0);
    }

    function test_tipEntityValidation() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(bob);
        vm.expectRevert("Must send ETH");
        tipping.tipEntity{value: 0}(entityHash);
    }

    function test_tipCommentUpdatesAuthorBalanceAndCommentTipTotal() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(alice);
        uint256 commentId = comments.comment(entityHash, "first comment", 0);

        vm.prank(alice);
        vm.expectRevert("Cannot tip yourself");
        tipping.tipComment{value: 0.1 ether}(commentId);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(tipping));
        emit MoralityTipping.CommentTipped(commentId, bob, alice, 0.4 ether);
        tipping.tipComment{value: 0.4 ether}(commentId);

        assertEq(tipping.balances(alice), 0.4 ether);
        assertEq(tipping.totalTipsGiven(bob), 0.4 ether);
        assertEq(tipping.totalTipsReceived(alice), 0.4 ether);

        MoralityComments.Comment memory commentData = comments.getComment(commentId);
        assertEq(commentData.tipTotal, 0.4 ether);
    }

    function test_tipCommentValidation() public {
        vm.prank(bob);
        vm.expectRevert("Must send ETH");
        tipping.tipComment{value: 0}(1);
    }

    function test_claimEscrowValidation() public {
        bytes32 entityHash = _registerEntityAs(alice);
        registry.approveOwnershipClaim(entityHash, alice);
        vm.prank(alice);
        registry.claimOwnership(entityHash);

        vm.prank(alice);
        vm.expectRevert("No escrowed funds");
        tipping.claimEscrow(entityHash);
    }

    function test_withdrawTransfersFundsAndClearsBalance() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(alice);
        uint256 commentId = comments.comment(entityHash, "withdraw target", 0);

        vm.prank(bob);
        tipping.tipComment{value: 1 ether}(commentId);

        uint256 before = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(tipping));
        emit MoralityTipping.Withdrawn(alice, 1 ether);
        tipping.withdraw();

        assertEq(alice.balance, before + 1 ether);
        assertEq(tipping.balances(alice), 0);
    }

    function test_withdrawRevertsWithoutBalance() public {
        vm.prank(alice);
        vm.expectRevert("No balance");
        tipping.withdraw();
    }

    function test_getEntityTipsPagination() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(bob);
        tipping.tipEntity{value: 0.1 ether}(entityHash);
        vm.prank(charlie);
        tipping.tipEntity{value: 0.2 ether}(entityHash);

        MoralityTipping.TipRecord[] memory first = tipping.getEntityTips(entityHash, 0, 1);
        assertEq(first.length, 1);
        assertEq(first[0].tipper, bob);
        assertEq(first[0].amount, 0.1 ether);

        MoralityTipping.TipRecord[] memory second = tipping.getEntityTips(entityHash, 1, 2);
        assertEq(second.length, 1);
        assertEq(second[0].tipper, charlie);
        assertEq(second[0].amount, 0.2 ether);

        assertEq(tipping.getEntityTipCount(entityHash), 2);
    }

    function test_pauseBlocksTipsAndEscrowClaims() public {
        bytes32 entityHash = _registerEntityAs(alice);

        vm.prank(bob);
        tipping.tipEntity{value: 0.25 ether}(entityHash);

        registry.approveOwnershipClaim(entityHash, alice);
        vm.prank(alice);
        registry.claimOwnership(entityHash);

        tipping.pause();

        vm.prank(charlie);
        vm.expectRevert();
        tipping.tipEntity{value: 0.1 ether}(entityHash);

        vm.prank(alice);
        vm.expectRevert();
        tipping.claimEscrow(entityHash);

        tipping.unpause();

        vm.prank(alice);
        tipping.claimEscrow(entityHash);

        assertEq(tipping.escrow(entityHash), 0);
        assertEq(tipping.balances(alice), 0.25 ether);
    }

    function test_rescueEthOnlyOwnerAndRejectsZeroAddress() public {
        vm.prank(bob);
        tipping.tipEntity{value: 0.1 ether}(UNREGISTERED_ENTITY);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, bob));
        tipping.rescueETH(payable(bob));

        vm.expectRevert("Zero address");
        tipping.rescueETH(payable(address(0)));
    }

    function _registerEntityAs(address registrant) internal returns (bytes32 entityHash) {
        vm.prank(registrant);
        entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        tipping.initialize(address(registry), address(comments));
    }
}
