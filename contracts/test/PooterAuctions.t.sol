// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PooterEditions.sol";
import "../src/PooterAuctions.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract PooterAuctionsTest is Test {
    PooterEditions public editions;
    PooterAuctions public auctions;

    address public owner = address(this);
    address public treasury = address(0xBAc9233725440c595b19d975309CC98cb259253a);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);

    bytes32 constant HASH = keccak256("edition-content");
    string constant TITLE = "THE GREAT UNWINDING";

    function setUp() public {
        // Deploy PooterEditions behind proxy
        PooterEditions impl = new PooterEditions();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(PooterEditions.initialize, ("https://pooter.world/api/edition/"))
        );
        editions = PooterEditions(address(proxy));

        // Deploy PooterAuctions
        auctions = new PooterAuctions(address(editions), treasury);

        // Set auctions as minter
        editions.setMinter(address(auctions));

        // Warp to epoch + 10 days so editions 1-10 are "past"
        vm.warp(editions.EPOCH() + (10 * 86400));

        // Fund test accounts
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    // ── createAuction ───────────────────────────────────────────────────

    function test_createAuction() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        (
            uint256 startTime,
            uint256 endTime,
            address highestBidder,
            uint256 highestBid,
            ,
            ,
            bool settled
        ) = auctions.auctions(1);

        assertEq(startTime, block.timestamp);
        assertEq(endTime, block.timestamp + 86400);
        assertEq(highestBidder, alice);
        assertEq(highestBid, 0.001 ether);
        assertFalse(settled);
    }

    function test_createAuctionEmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit PooterAuctions.AuctionCreated(1, alice, 0.001 ether);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);
    }

    function test_cannotCreateAuctionOnFutureEdition() public {
        // Edition 11 is current (today), should revert
        vm.prank(alice);
        vm.expectRevert(PooterAuctions.FutureEdition.selector);
        auctions.createAuction{value: 0.001 ether}(11, HASH, TITLE);
    }

    function test_cannotCreateAuctionOnMintedEdition() public {
        // Owner mints edition 1 directly
        editions.mint(1, HASH, TITLE);

        vm.prank(alice);
        vm.expectRevert(PooterAuctions.EditionAlreadyMinted.selector);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);
    }

    function test_cannotCreateDuplicateAuction() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        vm.prank(bob);
        vm.expectRevert(PooterAuctions.AuctionAlreadyExists.selector);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);
    }

    function test_cannotCreateAuctionBelowMinBid() public {
        vm.prank(alice);
        vm.expectRevert(PooterAuctions.BidTooLow.selector);
        auctions.createAuction{value: 0.0001 ether}(1, HASH, TITLE);
    }

    // ── bid ─────────────────────────────────────────────────────────────

    function test_bid() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        vm.prank(bob);
        auctions.bid{value: 0.002 ether}(1);

        (, , address highestBidder, uint256 highestBid, , , ) = auctions.auctions(1);
        assertEq(highestBidder, bob);
        assertEq(highestBid, 0.002 ether);

        // Alice should have pending return
        assertEq(auctions.pendingReturns(alice), 0.001 ether);
    }

    function test_bidBelowIncrement() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        // 10% increment required: 0.011 ether minimum
        vm.prank(bob);
        vm.expectRevert(PooterAuctions.BidTooLow.selector);
        auctions.bid{value: 0.0105 ether}(1);
    }

    function test_bidAfterEnd() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        // Warp past auction end
        vm.warp(block.timestamp + 86401);

        vm.prank(bob);
        vm.expectRevert(PooterAuctions.AuctionEnded.selector);
        auctions.bid{value: 0.002 ether}(1);
    }

    function test_bidOnNonexistentAuction() public {
        vm.prank(alice);
        vm.expectRevert(PooterAuctions.AuctionNotFound.selector);
        auctions.bid{value: 0.002 ether}(1);
    }

    function test_bidTimeExtension() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        // Warp to 2 minutes before end
        (, uint256 originalEnd, , , , , ) = auctions.auctions(1);
        vm.warp(originalEnd - 120);

        vm.prank(bob);
        auctions.bid{value: 0.002 ether}(1);

        (, uint256 newEnd, , , , , ) = auctions.auctions(1);
        assertEq(newEnd, block.timestamp + 300); // Extended by TIME_BUFFER
        assertTrue(newEnd > originalEnd);
    }

    function test_bidNoExtensionIfNotLastMinutes() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        (, uint256 originalEnd, , , , , ) = auctions.auctions(1);

        // Bid 1 hour into auction (well before buffer window)
        vm.warp(block.timestamp + 3600);

        vm.prank(bob);
        auctions.bid{value: 0.002 ether}(1);

        (, uint256 newEnd, , , , , ) = auctions.auctions(1);
        assertEq(newEnd, originalEnd); // Not extended
    }

    // ── settle ──────────────────────────────────────────────────────────

    function test_settle() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        // Warp past end
        vm.warp(block.timestamp + 86401);

        uint256 treasuryBefore = treasury.balance;
        auctions.settle(1);

        // NFT minted to alice
        assertEq(editions.ownerOf(1), alice);

        // Treasury received funds
        assertEq(treasury.balance, treasuryBefore + 0.01 ether);

        // Auction marked settled
        (, , , , , , bool settled) = auctions.auctions(1);
        assertTrue(settled);
    }

    function test_settleEmitsEvent() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        vm.warp(block.timestamp + 86401);

        vm.expectEmit(true, true, false, true);
        emit PooterAuctions.AuctionSettled(1, alice, 0.01 ether);
        auctions.settle(1);
    }

    function test_cannotSettleTooEarly() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        vm.expectRevert(PooterAuctions.AuctionNotEnded.selector);
        auctions.settle(1);
    }

    function test_cannotSettleTwice() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(1, HASH, TITLE);

        vm.warp(block.timestamp + 86401);
        auctions.settle(1);

        vm.expectRevert(PooterAuctions.AuctionAlreadySettled.selector);
        auctions.settle(1);
    }

    function test_cannotSettleNonexistent() public {
        vm.expectRevert(PooterAuctions.AuctionNotFound.selector);
        auctions.settle(1);
    }

    function test_anyoneCanSettle() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        vm.warp(block.timestamp + 86401);

        // Carol (random person) settles
        vm.prank(carol);
        auctions.settle(1);

        assertEq(editions.ownerOf(1), alice);
    }

    // ── withdrawPendingReturn ───────────────────────────────────────────

    function test_withdrawPendingReturn() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        vm.prank(bob);
        auctions.bid{value: 0.02 ether}(1);

        // Alice was outbid, should be able to withdraw
        uint256 balBefore = alice.balance;
        vm.prank(alice);
        auctions.withdrawPendingReturn();

        assertEq(alice.balance, balBefore + 0.01 ether);
        assertEq(auctions.pendingReturns(alice), 0);
    }

    function test_cannotWithdrawZero() public {
        vm.prank(alice);
        vm.expectRevert(PooterAuctions.NoPendingReturn.selector);
        auctions.withdrawPendingReturn();
    }

    function test_pendingReturnsAccumulate() public {
        // Alice creates auction on edition 1
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, TITLE);

        // Alice creates auction on edition 2
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(2, HASH, "ANOTHER");

        // Bob outbids alice on both
        vm.prank(bob);
        auctions.bid{value: 0.02 ether}(1);
        vm.prank(bob);
        auctions.bid{value: 0.02 ether}(2);

        // Alice's returns should accumulate
        assertEq(auctions.pendingReturns(alice), 0.02 ether);
    }

    // ── Multiple simultaneous auctions ──────────────────────────────────

    function test_multipleSimultaneousAuctions() public {
        vm.prank(alice);
        auctions.createAuction{value: 0.01 ether}(1, HASH, "EDITION ONE");

        vm.prank(bob);
        auctions.createAuction{value: 0.02 ether}(3, HASH, "EDITION THREE");

        // Both auctions active
        (uint256 start1, , , , , , ) = auctions.auctions(1);
        (uint256 start3, , , , , , ) = auctions.auctions(3);
        assertTrue(start1 > 0);
        assertTrue(start3 > 0);

        // Settle both after end
        vm.warp(block.timestamp + 86401);
        auctions.settle(1);
        auctions.settle(3);

        assertEq(editions.ownerOf(1), alice);
        assertEq(editions.ownerOf(3), bob);
    }

    // ── Admin ───────────────────────────────────────────────────────────

    function test_setTreasury() public {
        address newTreasury = address(0xDEAD);
        auctions.setTreasury(newTreasury);
        assertEq(auctions.treasury(), newTreasury);
    }

    function test_onlyOwnerCanSetTreasury() public {
        vm.prank(alice);
        vm.expectRevert();
        auctions.setTreasury(alice);
    }

    // ── Full lifecycle ──────────────────────────────────────────────────

    function test_fullAuctionLifecycle() public {
        // Alice starts auction
        vm.prank(alice);
        auctions.createAuction{value: 0.001 ether}(5, HASH, "FIVE");

        // Bob outbids
        vm.prank(bob);
        auctions.bid{value: 0.01 ether}(5);

        // Carol outbids in last 2 minutes (triggers extension)
        (, uint256 endTime, , , , , ) = auctions.auctions(5);
        vm.warp(endTime - 60);
        vm.prank(carol);
        auctions.bid{value: 0.02 ether}(5);

        // Alice and Bob have pending returns
        assertEq(auctions.pendingReturns(alice), 0.001 ether);
        assertEq(auctions.pendingReturns(bob), 0.01 ether);

        // Time extended — can't settle at original end
        vm.warp(endTime);
        vm.expectRevert(PooterAuctions.AuctionNotEnded.selector);
        auctions.settle(5);

        // Warp past new end
        (, uint256 newEnd, , , , , ) = auctions.auctions(5);
        vm.warp(newEnd + 1);

        // Settle
        uint256 treasuryBefore = treasury.balance;
        auctions.settle(5);

        assertEq(editions.ownerOf(5), carol);
        assertEq(treasury.balance, treasuryBefore + 0.02 ether);

        // Alice and Bob withdraw
        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        auctions.withdrawPendingReturn();
        assertEq(alice.balance, aliceBefore + 0.001 ether);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        auctions.withdrawPendingReturn();
        assertEq(bob.balance, bobBefore + 0.01 ether);

        // Edition data stored correctly
        (bytes32 h, , string memory title) = editions.getEdition(5);
        assertEq(h, HASH);
        assertEq(title, "FIVE");
    }
}
