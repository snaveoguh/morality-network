// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityRegistry.sol";
import "../src/MoralityRatings.sol";
import "../src/MoralityComments.sol";
import "../src/MoralityTipping.sol";
import "../src/MoralityLeaderboard.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityLeaderboardTest is Test {
    MoralityRegistry internal registry;
    MoralityRatings internal ratings;
    MoralityComments internal comments;
    MoralityTipping internal tipping;
    MoralityLeaderboard internal leaderboard;

    address internal owner = address(this);
    address internal oracle = makeAddr("oracle");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

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

        MoralityLeaderboard leaderboardImpl = new MoralityLeaderboard();
        ERC1967Proxy leaderboardProxy = new ERC1967Proxy(
            address(leaderboardImpl),
            abi.encodeCall(MoralityLeaderboard.initialize, (address(registry), address(ratings), address(tipping), address(comments)))
        );
        leaderboard = MoralityLeaderboard(address(leaderboardProxy));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_setAIOracleOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        leaderboard.setAIOracle(oracle);

        vm.expectEmit(true, true, false, false, address(leaderboard));
        emit MoralityLeaderboard.OracleUpdated(address(0), oracle);
        leaderboard.setAIOracle(oracle);
        assertEq(leaderboard.aiOracle(), oracle);
    }

    function test_updateAIScoreAccessControlAndValidation() public {
        bytes32 entityHash = keccak256("entity:access");

        vm.prank(alice);
        vm.expectRevert("Not oracle");
        leaderboard.updateAIScore(entityHash, 100);

        leaderboard.updateAIScore(entityHash, 2500);
        assertEq(leaderboard.aiScores(entityHash), 2500);

        leaderboard.setAIOracle(oracle);
        vm.prank(oracle);
        leaderboard.updateAIScore(entityHash, 9000);
        assertEq(leaderboard.aiScores(entityHash), 9000);

        vm.prank(oracle);
        vm.expectRevert("Score max 10000");
        leaderboard.updateAIScore(entityHash, 10001);
    }

    function test_batchUpdateAIScoresValidation() public {
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = keccak256("a");
        hashes[1] = keccak256("b");

        uint256[] memory scores = new uint256[](1);
        scores[0] = 1000;

        vm.expectRevert("Length mismatch");
        leaderboard.batchUpdateAIScores(hashes, scores);

        uint256[] memory validScores = new uint256[](2);
        validScores[0] = 4000;
        validScores[1] = 5000;
        leaderboard.batchUpdateAIScores(hashes, validScores);
        assertEq(leaderboard.aiScores(hashes[0]), 4000);
        assertEq(leaderboard.aiScores(hashes[1]), 5000);

        validScores[1] = 10001;
        vm.expectRevert("Score max 10000");
        leaderboard.batchUpdateAIScores(hashes, validScores);
    }

    function test_transferOwnershipValidation() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        leaderboard.transferOwnership(alice);

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableInvalidOwner.selector, address(0)));
        leaderboard.transferOwnership(address(0));

        leaderboard.transferOwnership(alice);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, owner));
        leaderboard.setAIOracle(oracle);

        vm.prank(alice);
        leaderboard.setAIOracle(oracle);
    }

    function test_getCompositeScoreReturnsZeroWhenNoSignals() public {
        bytes32 entityHash = keccak256("entity:empty");
        assertEq(leaderboard.getCompositeScore(entityHash), 0);
    }

    function test_getCompositeScoreWeightedBlend() public {
        bytes32 entityHash = _registerEntity("entity:blend");

        vm.prank(alice);
        ratings.rate(entityHash, 5); // ratingComponent = 10000

        leaderboard.updateAIScore(entityHash, 8000); // aiComponent = 8000

        vm.prank(bob);
        tipping.tipEntity{value: 0.01 ether}(entityHash); // tipComponent = 5000

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(alice);
            comments.comment(entityHash, string.concat("c", vm.toString(i)), 0); // engagementComponent = 2500
        }

        uint256 score = leaderboard.getCompositeScore(entityHash);
        // (10000*40 + 8000*30 + 5000*20 + 2500*10) / 100 = 7650
        assertEq(score, 7650);
    }

    function test_getCompositeScoreTipTiers() public {
        bytes32 noTip = _registerEntity("entity:notip");
        assertEq(leaderboard.getCompositeScore(noTip), 0);

        bytes32 tier1 = _registerEntity("entity:tip-1");
        vm.prank(bob);
        tipping.tipEntity{value: 0.0005 ether}(tier1); // 1000 -> 200
        assertEq(leaderboard.getCompositeScore(tier1), 200);

        bytes32 tier2 = _registerEntity("entity:tip-2");
        vm.prank(bob);
        tipping.tipEntity{value: 0.001 ether}(tier2); // 2500 -> 500
        assertEq(leaderboard.getCompositeScore(tier2), 500);

        bytes32 tier3 = _registerEntity("entity:tip-3");
        vm.prank(bob);
        tipping.tipEntity{value: 0.01 ether}(tier3); // 5000 -> 1000
        assertEq(leaderboard.getCompositeScore(tier3), 1000);

        bytes32 tier4 = _registerEntity("entity:tip-4");
        vm.prank(bob);
        tipping.tipEntity{value: 0.1 ether}(tier4); // 7500 -> 1500
        assertEq(leaderboard.getCompositeScore(tier4), 1500);

        bytes32 tier5 = _registerEntity("entity:tip-5");
        vm.prank(bob);
        tipping.tipEntity{value: 1 ether}(tier5); // 10000 -> 2000
        assertEq(leaderboard.getCompositeScore(tier5), 2000);
    }

    function test_getCompositeScoreEngagementTiers() public {
        bytes32 tier0 = _registerEntity("entity:eng-0");
        assertEq(leaderboard.getCompositeScore(tier0), 0);

        bytes32 tier1 = _registerEntity("entity:eng-1");
        _commentMany(tier1, 1);
        assertEq(leaderboard.getCompositeScore(tier1), 100);

        bytes32 tier2 = _registerEntity("entity:eng-2");
        _commentMany(tier2, 3);
        assertEq(leaderboard.getCompositeScore(tier2), 250);

        bytes32 tier3 = _registerEntity("entity:eng-3");
        _commentMany(tier3, 10);
        assertEq(leaderboard.getCompositeScore(tier3), 500);

        bytes32 tier4 = _registerEntity("entity:eng-4");
        _commentMany(tier4, 50);
        assertEq(leaderboard.getCompositeScore(tier4), 750);

        bytes32 tier5 = _registerEntity("entity:eng-5");
        _commentMany(tier5, 100);
        assertEq(leaderboard.getCompositeScore(tier5), 1000);
    }

    function _registerEntity(string memory seed) internal returns (bytes32 entityHash) {
        string memory identifier = string.concat("https://example.com/", seed);
        vm.prank(alice);
        entityHash = registry.registerEntity(identifier, MoralityRegistry.EntityType.URL);
    }

    function _commentMany(bytes32 entityHash, uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            vm.prank(alice);
            comments.comment(entityHash, string.concat("comment-", vm.toString(i)), 0);
        }
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        leaderboard.initialize(address(registry), address(ratings), address(tipping), address(comments));
    }
}
