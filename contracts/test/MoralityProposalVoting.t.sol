// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityProposalVoting.sol";

contract MockNounsToken {
    mapping(address => uint256) public balances;

    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return balances[owner];
    }
}

contract MockProposalGovernor {
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

contract MoralityProposalVotingTest is Test {
    MoralityProposalVoting internal voting;
    MockNounsToken internal nounsToken;
    MockProposalGovernor internal governor;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        nounsToken = new MockNounsToken();
        governor = new MockProposalGovernor();
        voting = new MoralityProposalVoting(address(nounsToken));

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(address(voting), 5 ether);
    }

    function test_constructorRequiresNounsToken() public {
        vm.expectRevert("Nouns token required");
        new MoralityProposalVoting(address(0));
    }

    function test_setDaoResolverOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        voting.setDaoResolver("nouns", address(governor), true);

        voting.setDaoResolver("nouns", address(governor), true);
        assertTrue(voting.isDaoResolvable("nouns"));
    }

    function test_castVoteNoRefundWhenDaoNotConfigured() public {
        nounsToken.setBalance(alice, 1);
        vm.txGasPrice(1 gwei);

        uint256 contractBefore = address(voting).balance;
        vm.prank(alice);
        voting.castVote("random-dao", "123", MoralityProposalVoting.VoteType.FOR, "signal");

        assertEq(address(voting).balance, contractBefore);
        (,,, uint256 totalVoters) = voting.getProposalVotes("random-dao", "123");
        assertEq(totalVoters, 1);
    }

    function test_castVoteNoRefundForNonNumericProposalId() public {
        voting.setDaoResolver("nouns", address(governor), true);
        nounsToken.setBalance(alice, 1);
        vm.txGasPrice(1 gwei);

        uint256 contractBefore = address(voting).balance;
        vm.prank(alice);
        voting.castVote("nouns", "abc", MoralityProposalVoting.VoteType.FOR, "signal");

        assertEq(address(voting).balance, contractBefore);
    }

    function test_castVoteNoRefundWhenGovernorProposalMissing() public {
        voting.setDaoResolver("nouns", address(governor), true);
        nounsToken.setBalance(alice, 1);
        vm.txGasPrice(1 gwei);

        uint256 contractBefore = address(voting).balance;
        vm.prank(alice);
        voting.castVote("nouns", "999", MoralityProposalVoting.VoteType.AGAINST, "signal");

        assertEq(address(voting).balance, contractBefore);
    }

    function test_castVoteRefundsWhenOnchainResolvableAndHolder() public {
        voting.setDaoResolver("nouns", address(governor), true);
        governor.setProposalState(42, 1, true); // Active
        nounsToken.setBalance(alice, 1);
        vm.txGasPrice(1 gwei);

        uint256 contractBefore = address(voting).balance;
        vm.prank(alice);
        voting.castVote("nouns", "42", MoralityProposalVoting.VoteType.FOR, "onchain + holder");

        assertLt(address(voting).balance, contractBefore);
    }

    function test_reasonLengthValidation() public {
        string memory tooLong = new string(501);
        vm.prank(alice);
        vm.expectRevert("Reason too long");
        voting.castVote("nouns", "1", MoralityProposalVoting.VoteType.FOR, tooLong);
    }

    function test_cannotVoteTwiceOnSameProposalKey() public {
        vm.prank(alice);
        voting.castVote("nouns", "77", MoralityProposalVoting.VoteType.FOR, "first");

        vm.prank(alice);
        vm.expectRevert("Already voted");
        voting.castVote("nouns", "77", MoralityProposalVoting.VoteType.AGAINST, "second");
    }
}
