// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PooterEditions.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract PooterEditionsV2Test is Test {
    PooterEditions public editions;
    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public minterAddr = address(0xBEEF);

    function setUp() public {
        PooterEditions impl = new PooterEditions();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(PooterEditions.initialize, ("https://pooter.world/api/edition/"))
        );
        editions = PooterEditions(address(proxy));
    }

    // ── setMinter ───────────────────────────────────────────────────────

    function test_setMinter() public {
        editions.setMinter(minterAddr);
        assertEq(editions.minter(), minterAddr);
    }

    function test_onlyOwnerCanSetMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        editions.setMinter(minterAddr);
    }

    function test_emitsMinterUpdated() public {
        vm.expectEmit(true, false, false, false);
        emit PooterEditions.MinterUpdated(minterAddr);
        editions.setMinter(minterAddr);
    }

    // ── mintFor ─────────────────────────────────────────────────────────

    function test_mintForByOwner() public {
        editions.mintFor(alice, 1, keccak256("content"), "TITLE");
        assertEq(editions.ownerOf(1), alice);
        assertEq(editions.totalMinted(), 1);
    }

    function test_mintForByMinter() public {
        editions.setMinter(minterAddr);

        vm.prank(minterAddr);
        editions.mintFor(alice, 1, keccak256("content"), "TITLE");

        assertEq(editions.ownerOf(1), alice);
        assertEq(editions.totalMinted(), 1);
    }

    function test_mintForRevertsForNonMinter() public {
        editions.setMinter(minterAddr);

        vm.prank(alice);
        vm.expectRevert(PooterEditions.NotMinterOrOwner.selector);
        editions.mintFor(alice, 1, keccak256("content"), "TITLE");
    }

    function test_mintForRevertsEditionZero() public {
        vm.expectRevert(abi.encodeWithSelector(PooterEditions.InvalidEditionNumber.selector, 0));
        editions.mintFor(alice, 0, keccak256("content"), "TITLE");
    }

    function test_mintForRevertsDuplicate() public {
        editions.mintFor(alice, 1, keccak256("first"), "FIRST");

        vm.expectRevert(abi.encodeWithSelector(PooterEditions.EditionAlreadyMinted.selector, 1));
        editions.mintFor(alice, 1, keccak256("second"), "SECOND");
    }

    // ── Backward compat: mint() still works ─────────────────────────────

    function test_originalMintStillWorks() public {
        editions.mint(1, keccak256("content"), "TITLE");
        assertEq(editions.ownerOf(1), owner);
    }

    // ── Storage layout preserved ────────────────────────────────────────

    function test_existingDataSurvivesAfterMinterSet() public {
        // Mint before setting minter
        editions.mint(1, keccak256("day1"), "DAY ONE");
        editions.mint(2, keccak256("day2"), "DAY TWO");

        // Set minter
        editions.setMinter(minterAddr);

        // Verify existing data intact
        assertEq(editions.ownerOf(1), owner);
        assertEq(editions.ownerOf(2), owner);
        assertEq(editions.totalMinted(), 2);

        (bytes32 hash1, , string memory title1) = editions.getEdition(1);
        assertEq(hash1, keccak256("day1"));
        assertEq(title1, "DAY ONE");

        // Minter can mint new editions
        vm.prank(minterAddr);
        editions.mintFor(alice, 3, keccak256("day3"), "DAY THREE");
        assertEq(editions.ownerOf(3), alice);
        assertEq(editions.totalMinted(), 3);
    }
}
