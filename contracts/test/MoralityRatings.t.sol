// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityRegistry.sol";
import "../src/MoralityRatings.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MoralityRatingsTest is Test {
    MoralityRegistry internal registry;
    MoralityRatings internal ratings;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal charlie = makeAddr("charlie");

    bytes32 internal constant ENTITY_HASH = keccak256("entity:ftx-collapse");

    function setUp() public {
        MoralityRegistry registryImpl = new MoralityRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(MoralityRegistry.initialize, ())
        );
        registry = MoralityRegistry(address(registryProxy));

        MoralityRatings ratingsImpl = new MoralityRatings();
        ERC1967Proxy ratingsProxy = new ERC1967Proxy(
            address(ratingsImpl),
            abi.encodeCall(MoralityRatings.initialize, (address(registry)))
        );
        ratings = MoralityRatings(address(ratingsProxy));
    }

    function test_rateNewRatingAndAverage() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.Rated(ENTITY_HASH, alice, 4);
        ratings.rate(ENTITY_HASH, 4);

        (uint256 avg, uint256 count) = ratings.getAverageRating(ENTITY_HASH);
        assertEq(avg, 400);
        assertEq(count, 1);

        (uint8 score,) = ratings.getUserRating(ENTITY_HASH, alice);
        assertEq(score, 4);
        assertTrue(ratings.hasRated(ENTITY_HASH, alice));
    }

    function test_rateUpdateExistingRating() public {
        vm.startPrank(alice);
        ratings.rate(ENTITY_HASH, 5);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.RatingUpdated(ENTITY_HASH, alice, 5, 2);
        ratings.rate(ENTITY_HASH, 2);
        vm.stopPrank();

        (uint256 avg, uint256 count) = ratings.getAverageRating(ENTITY_HASH);
        assertEq(avg, 200);
        assertEq(count, 1);
    }

    function test_rateRevertsOutOfRange() public {
        vm.prank(alice);
        vm.expectRevert("Score must be 1-5");
        ratings.rate(ENTITY_HASH, 0);

        vm.prank(alice);
        vm.expectRevert("Score must be 1-5");
        ratings.rate(ENTITY_HASH, 6);
    }

    function test_rateWithReasonStoresReason() public {
        string memory reason = "Whale voting pattern and treasury pressure.";

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.RatedWithReason(ENTITY_HASH, alice, 5, reason);
        ratings.rateWithReason(ENTITY_HASH, 5, reason);

        (string memory storedReason,, bool exists) = ratings.getRatingReason(ENTITY_HASH, alice);
        assertTrue(exists);
        assertEq(storedReason, reason);
    }

    function test_rateWithReasonUpdateEmitsAndReplacesReason() public {
        vm.prank(alice);
        ratings.rateWithReason(ENTITY_HASH, 4, "Initial context");

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.RatingWithReasonUpdated(ENTITY_HASH, alice, 4, 1, "Revised context");
        ratings.rateWithReason(ENTITY_HASH, 1, "Revised context");

        (string memory storedReason,, bool exists) = ratings.getRatingReason(ENTITY_HASH, alice);
        assertTrue(exists);
        assertEq(storedReason, "Revised context");

        (uint256 avg, uint256 count) = ratings.getAverageRating(ENTITY_HASH);
        assertEq(avg, 100);
        assertEq(count, 1);
    }

    function test_rateWithReasonValidation() public {
        vm.prank(alice);
        vm.expectRevert("Reason required");
        ratings.rateWithReason(ENTITY_HASH, 3, "");

        string memory tooLong = new string(501);
        vm.prank(alice);
        vm.expectRevert("Reason too long");
        ratings.rateWithReason(ENTITY_HASH, 3, tooLong);
    }

    function test_getRatersPagination() public {
        vm.prank(alice);
        ratings.rate(ENTITY_HASH, 2);
        vm.prank(bob);
        ratings.rate(ENTITY_HASH, 3);
        vm.prank(charlie);
        ratings.rate(ENTITY_HASH, 4);

        address[] memory page0 = ratings.getRaters(ENTITY_HASH, 0, 2);
        assertEq(page0.length, 2);
        assertEq(page0[0], alice);
        assertEq(page0[1], bob);

        address[] memory page1 = ratings.getRaters(ENTITY_HASH, 2, 2);
        assertEq(page1.length, 1);
        assertEq(page1[0], charlie);

        address[] memory emptyPage = ratings.getRaters(ENTITY_HASH, 4, 2);
        assertEq(emptyPage.length, 0);
    }

    function test_rateInterpretationNewAndUpdate() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.InterpretationRated(ENTITY_HASH, alice, 90, 80, 70, "First pass");
        ratings.rateInterpretation(ENTITY_HASH, 90, 80, 70, "First pass");

        (uint256 avgTruth, uint256 avgImportance, uint256 avgMoralImpact, uint256 count) =
            ratings.getAverageInterpretation(ENTITY_HASH);
        assertEq(avgTruth, 9000);
        assertEq(avgImportance, 8000);
        assertEq(avgMoralImpact, 7000);
        assertEq(count, 1);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(ratings));
        emit MoralityRatings.InterpretationRatingUpdated(
            ENTITY_HASH, alice, 90, 80, 70, 60, 50, 40, "Evidence changed"
        );
        ratings.rateInterpretation(ENTITY_HASH, 60, 50, 40, "Evidence changed");

        (avgTruth, avgImportance, avgMoralImpact, count) = ratings.getAverageInterpretation(ENTITY_HASH);
        assertEq(avgTruth, 6000);
        assertEq(avgImportance, 5000);
        assertEq(avgMoralImpact, 4000);
        assertEq(count, 1);

        (string memory reason,, bool exists) = ratings.getRatingReason(ENTITY_HASH, alice);
        assertTrue(exists);
        assertEq(reason, "Evidence changed");
    }

    function test_rateInterpretationValidation() public {
        vm.prank(alice);
        vm.expectRevert("Dimensions must be 0-100");
        ratings.rateInterpretation(ENTITY_HASH, 101, 80, 70, "invalid");

        string memory tooLong = new string(501);
        vm.prank(alice);
        vm.expectRevert("Reason too long");
        ratings.rateInterpretation(ENTITY_HASH, 80, 70, 60, tooLong);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        ratings.initialize(address(registry));
    }
}
