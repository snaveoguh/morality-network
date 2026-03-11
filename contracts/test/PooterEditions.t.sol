// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PooterEditions.sol";

contract PooterEditionsTest is Test {
    PooterEditions public editions;
    address public owner = address(this);
    address public alice = address(0xA11CE);

    function setUp() public {
        editions = new PooterEditions("https://pooter.world/api/edition/");
    }

    // ── Mint ──────────────────────────────────────────────────────────────

    function test_mintEdition() public {
        bytes32 contentHash = keccak256("edition1-content");
        editions.mint(1, contentHash, "THE GREAT UNWINDING");

        assertEq(editions.ownerOf(1), owner);
        assertEq(editions.totalMinted(), 1);

        (bytes32 storedHash, uint256 editionDate, string memory title) = editions.getEdition(1);
        assertEq(storedHash, contentHash);
        assertEq(editionDate, editions.EPOCH()); // Edition 1 = epoch day
        assertEq(title, "THE GREAT UNWINDING");
    }

    function test_mintMultipleEditions() public {
        editions.mint(1, keccak256("day1"), "DAY ONE");
        editions.mint(2, keccak256("day2"), "DAY TWO");
        editions.mint(5, keccak256("day5"), "DAY FIVE");

        assertEq(editions.totalMinted(), 3);
        assertEq(editions.ownerOf(1), owner);
        assertEq(editions.ownerOf(2), owner);
        assertEq(editions.ownerOf(5), owner);

        // Edition 2 should be epoch + 1 day
        (, uint256 date2,) = editions.getEdition(2);
        assertEq(date2, editions.EPOCH() + 86400);

        // Edition 5 should be epoch + 4 days
        (, uint256 date5,) = editions.getEdition(5);
        assertEq(date5, editions.EPOCH() + (4 * 86400));
    }

    // ── Revert: duplicate mint ────────────────────────────────────────────

    function test_cannotMintDuplicate() public {
        editions.mint(1, keccak256("first"), "FIRST");

        vm.expectRevert(abi.encodeWithSelector(PooterEditions.EditionAlreadyMinted.selector, 1));
        editions.mint(1, keccak256("second"), "SECOND");
    }

    // ── Revert: invalid edition number ────────────────────────────────────

    function test_cannotMintEditionZero() public {
        vm.expectRevert(abi.encodeWithSelector(PooterEditions.InvalidEditionNumber.selector, 0));
        editions.mint(0, keccak256("zero"), "ZERO");
    }

    // ── Revert: only owner ────────────────────────────────────────────────

    function test_onlyOwnerCanMint() public {
        vm.prank(alice);
        vm.expectRevert();
        editions.mint(1, keccak256("hack"), "HACKED");
    }

    // ── Token URI ─────────────────────────────────────────────────────────

    function test_tokenURI() public {
        editions.mint(1, keccak256("content"), "TITLE");
        assertEq(editions.tokenURI(1), "https://pooter.world/api/edition/1");
    }

    function test_tokenURIMultiDigit() public {
        editions.mint(801, keccak256("content"), "TITLE");
        assertEq(editions.tokenURI(801), "https://pooter.world/api/edition/801");
    }

    function test_tokenURIRevertsForUnminted() public {
        vm.expectRevert();
        editions.tokenURI(999);
    }

    // ── setBaseTokenURI ───────────────────────────────────────────────────

    function test_setBaseTokenURI() public {
        editions.mint(1, keccak256("content"), "TITLE");
        editions.setBaseTokenURI("https://new.pooter.world/api/edition/");
        assertEq(editions.tokenURI(1), "https://new.pooter.world/api/edition/1");
    }

    function test_onlyOwnerCanSetBaseTokenURI() public {
        vm.prank(alice);
        vm.expectRevert();
        editions.setBaseTokenURI("https://evil.com/");
    }

    // ── currentEditionNumber ──────────────────────────────────────────────

    function test_currentEditionNumber() public {
        // Warp to epoch → edition 1
        vm.warp(editions.EPOCH());
        assertEq(editions.currentEditionNumber(), 1);

        // Warp to epoch + 1 day → edition 2
        vm.warp(editions.EPOCH() + 86400);
        assertEq(editions.currentEditionNumber(), 2);

        // Warp to epoch + 10 days → edition 11
        vm.warp(editions.EPOCH() + (10 * 86400));
        assertEq(editions.currentEditionNumber(), 11);
    }

    function test_currentEditionNumberBeforeEpoch() public {
        vm.warp(editions.EPOCH() - 1);
        assertEq(editions.currentEditionNumber(), 0);
    }

    // ── Events ────────────────────────────────────────────────────────────

    function test_emitsEditionMinted() public {
        bytes32 contentHash = keccak256("content");
        vm.expectEmit(true, true, false, true);
        emit PooterEditions.EditionMinted(1, owner, contentHash, "SIGNAL");
        editions.mint(1, contentHash, "SIGNAL");
    }

    // ── Transfer ──────────────────────────────────────────────────────────

    function test_transferAfterMint() public {
        editions.mint(1, keccak256("content"), "TITLE");
        editions.transferFrom(owner, alice, 1);
        assertEq(editions.ownerOf(1), alice);
    }

    // ── ERC721 metadata ───────────────────────────────────────────────────

    function test_nameAndSymbol() public view {
        assertEq(editions.name(), "Pooter Editions");
        assertEq(editions.symbol(), "POOTER");
    }

    // ── Epoch constant ────────────────────────────────────────────────────

    function test_epochConstant() public view {
        // March 11 2026 00:00 UTC
        assertEq(editions.EPOCH(), 1741651200);
    }
}
