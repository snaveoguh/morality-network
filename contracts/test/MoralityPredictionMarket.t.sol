// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityPredictionMarket.sol";

contract MockGovernorState {
    mapping(uint256 => uint8) public proposalStates;
    mapping(uint256 => bool) public proposalExists;

    function setProposalState(uint256 proposalId, uint8 stateValue, bool exists_) external {
        proposalStates[proposalId] = stateValue;
        proposalExists[proposalId] = exists_;
    }

    function state(uint256 proposalId) external view returns (uint8) {
        require(proposalExists[proposalId], "missing proposal");
        return proposalStates[proposalId];
    }
}

contract MoralityPredictionMarketTest is Test {
    MoralityPredictionMarket internal market;
    MockGovernorState internal governorA;
    MockGovernorState internal governorB;

    address internal owner = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal charlie = makeAddr("charlie");

    string internal constant DAO = "nouns";
    string internal constant PROPOSAL_ID = "100";

    function setUp() public {
        market = new MoralityPredictionMarket();
        governorA = new MockGovernorState();
        governorB = new MockGovernorState();

        vm.deal(alice, 20 ether);
        vm.deal(bob, 20 ether);
        vm.deal(charlie, 20 ether);
    }

    function test_setDaoResolverOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        market.setDaoResolver(DAO, address(governorA), true);

        market.setDaoResolver(DAO, address(governorA), true);
        assertTrue(market.isDaoResolvable(DAO));
    }

    function test_stakeRequiresNumericProposalId() public {
        market.setDaoResolver(DAO, address(governorA), true);
        vm.prank(alice);
        vm.expectRevert("Proposal ID must be numeric");
        market.stake{value: 0.1 ether}(DAO, "abc", true);
    }

    function test_createMarketRequiresProposalOpen() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 4, true); // Succeeded (final)

        vm.expectRevert("Proposal not open");
        market.createMarket(DAO, PROPOSAL_ID);

        governorA.setProposalState(100, 1, true); // Active
        market.createMarket(DAO, PROPOSAL_ID);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.UNRESOLVED));
        assertTrue(exists);
    }

    function test_stakeRevertsWhenProposalFinalBeforeBet() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        governorA.setProposalState(100, 4, true); // Succeeded (final)

        vm.prank(bob);
        vm.expectRevert("Proposal not open");
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);
    }

    function test_existingMarketUsesLockedGovernorAfterResolverChange() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active

        vm.prank(alice);
        market.stake{value: 0.3 ether}(DAO, PROPOSAL_ID, true);

        // Repoint DAO resolver after market creation.
        market.setDaoResolver(DAO, address(governorB), true);
        governorB.setProposalState(100, 4, true); // Final on new resolver (should be ignored)

        // Still stakeable because market is pinned to governorA.
        vm.prank(bob);
        market.stake{value: 0.4 ether}(DAO, PROPOSAL_ID, false);

        // Now finalize on governorA and resolve.
        governorA.setProposalState(100, 3, true); // Defeated -> AGAINST
        market.resolve(DAO, PROPOSAL_ID);

        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(_proposalKey(PROPOSAL_ID));
        assertTrue(exists);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.AGAINST));
    }

    function test_claimWinningsAfterResolution() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        vm.prank(bob);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);

        governorA.setProposalState(100, 4, true); // Succeeded -> FOR
        market.resolve(DAO, PROPOSAL_ID);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim(DAO, PROPOSAL_ID);

        // Winner payout = 2 ETH pot - 2% fee on 1 ETH profit = 1.98 ETH
        assertEq(alice.balance, aliceBefore + 1.98 ether);

        vm.prank(bob);
        vm.expectRevert("Nothing to claim");
        market.claim(DAO, PROPOSAL_ID);
    }

    function test_resolveRevertsWhenProposalNotFinal() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active

        vm.prank(alice);
        market.stake{value: 0.2 ether}(DAO, PROPOSAL_ID, true);

        vm.expectRevert("Proposal not final");
        market.resolve(DAO, PROPOSAL_ID);
    }

    function _proposalKey(string memory proposalId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(DAO, ":", proposalId));
    }
}
