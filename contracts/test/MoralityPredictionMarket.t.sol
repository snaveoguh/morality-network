// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityPredictionMarket.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

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
        MoralityPredictionMarket impl = new MoralityPredictionMarket();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(MoralityPredictionMarket.initialize, ())
        );
        market = MoralityPredictionMarket(payable(address(proxy)));
        governorA = new MockGovernorState();
        governorB = new MockGovernorState();

        vm.deal(alice, 20 ether);
        vm.deal(bob, 20 ether);
        vm.deal(charlie, 20 ether);
    }

    // ========================================================================
    // ADMIN
    // ========================================================================

    function test_setDaoResolverOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        market.setDaoResolver(DAO, address(governorA), true);

        market.setDaoResolver(DAO, address(governorA), true);
        assertTrue(market.isDaoResolvable(DAO));
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        market.initialize();
    }

    // ========================================================================
    // MARKET CREATION — owner only
    // ========================================================================

    function test_createMarketOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        market.createMarket(DAO, PROPOSAL_ID);
    }

    function test_createMarketWithoutGovernor() public {
        // Owner can create markets without a DAO resolver — "owner-managed".
        market.createMarket(DAO, PROPOSAL_ID);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.UNRESOLVED));
        assertTrue(exists);
    }

    function test_createMarketLocksGovernorIfConfigured() public {
        market.setDaoResolver(DAO, address(governorA), true);
        market.createMarket(DAO, PROPOSAL_ID);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,,, address governor,,) = market.markets(key);
        assertEq(governor, address(governorA));
    }

    function test_createMarketDuplicate() public {
        market.createMarket(DAO, PROPOSAL_ID);
        vm.expectRevert("Market exists");
        market.createMarket(DAO, PROPOSAL_ID);
    }

    function test_createMarketRequiresNumericProposalId() public {
        vm.expectRevert("Proposal ID must be numeric");
        market.createMarket(DAO, "abc");
    }

    // ========================================================================
    // STAKING
    // ========================================================================

    function test_stakeRequiresMarketExists() public {
        vm.prank(alice);
        vm.expectRevert("No market");
        market.stake{value: 0.1 ether}(DAO, PROPOSAL_ID, true);
    }

    function test_stakeOnOwnerManagedMarket() public {
        // No governor — staking is open until owner resolves.
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        vm.prank(bob);
        market.stake{value: 0.5 ether}(DAO, PROPOSAL_ID, false);

        (uint256 forPool, uint256 againstPool,,,,,, bool exists) = market.getMarket(DAO, PROPOSAL_ID);
        assertTrue(exists);
        assertEq(forPool, 1 ether);
        assertEq(againstPool, 0.5 ether);
    }

    function test_stakeRevertsWhenProposalFinalOnchainGovernor() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        governorA.setProposalState(100, 4, true); // Succeeded (final)

        vm.prank(bob);
        vm.expectRevert("Proposal not open");
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);
    }

    function test_stakeRevertsOnResolvedMarket() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.FOR);

        vm.prank(bob);
        vm.expectRevert("Market resolved");
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);
    }

    // ========================================================================
    // OWNER RESOLVE
    // ========================================================================

    function test_ownerResolveFor() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);
        vm.prank(bob);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);

        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.FOR);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertTrue(exists);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.FOR));
    }

    function test_ownerResolveAgainst() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);
        vm.prank(bob);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);

        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.AGAINST);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertTrue(exists);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.AGAINST));
    }

    function test_ownerResolveVoidRefundsAll() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);
        vm.prank(bob);
        market.stake{value: 0.5 ether}(DAO, PROPOSAL_ID, false);

        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.VOID);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(alice);
        market.claim(DAO, PROPOSAL_ID);
        vm.prank(bob);
        market.claim(DAO, PROPOSAL_ID);

        assertEq(alice.balance, aliceBefore + 1 ether);
        assertEq(bob.balance, bobBefore + 0.5 ether);
    }

    function test_ownerResolveOnlyOwner() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.FOR);
    }

    function test_ownerResolveRejectsUnresolved() public {
        market.createMarket(DAO, PROPOSAL_ID);
        vm.expectRevert("Invalid outcome");
        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.UNRESOLVED);
    }

    function test_ownerResolveCannotDoubleResolve() public {
        market.createMarket(DAO, PROPOSAL_ID);
        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.FOR);

        vm.expectRevert("Already resolved");
        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.AGAINST);
    }

    // ========================================================================
    // ONCHAIN RESOLVE (same-chain governor)
    // ========================================================================

    function test_resolveOnchainGovernor() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 0.3 ether}(DAO, PROPOSAL_ID, true);

        governorA.setProposalState(100, 3, true); // Defeated -> AGAINST
        market.resolve(DAO, PROPOSAL_ID);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertTrue(exists);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.AGAINST));
    }

    function test_resolveRevertsOnOwnerManagedMarket() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.expectRevert("Use ownerResolve for this market");
        market.resolve(DAO, PROPOSAL_ID);
    }

    function test_resolveRevertsWhenProposalNotFinal() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 0.2 ether}(DAO, PROPOSAL_ID, true);

        vm.expectRevert("Proposal not final");
        market.resolve(DAO, PROPOSAL_ID);
    }

    function test_existingMarketUsesLockedGovernorAfterResolverChange() public {
        market.setDaoResolver(DAO, address(governorA), true);
        market.createMarket(DAO, PROPOSAL_ID);

        governorA.setProposalState(100, 1, true); // Active
        vm.prank(alice);
        market.stake{value: 0.3 ether}(DAO, PROPOSAL_ID, true);

        // Repoint DAO resolver after market creation.
        market.setDaoResolver(DAO, address(governorB), true);
        governorB.setProposalState(100, 4, true); // Final on new resolver (should be ignored)

        // Still stakeable because market is pinned to governorA (still active).
        vm.prank(bob);
        market.stake{value: 0.4 ether}(DAO, PROPOSAL_ID, false);

        // Now finalize on governorA and resolve.
        governorA.setProposalState(100, 3, true); // Defeated -> AGAINST
        market.resolve(DAO, PROPOSAL_ID);

        bytes32 key = _proposalKey(PROPOSAL_ID);
        (,,,,,,, MoralityPredictionMarket.Outcome outcome,,, bool exists) = market.markets(key);
        assertTrue(exists);
        assertEq(uint8(outcome), uint8(MoralityPredictionMarket.Outcome.AGAINST));
    }

    // ========================================================================
    // CLAIMING
    // ========================================================================

    function test_claimWinningsAfterOwnerResolve() public {
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        vm.prank(bob);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);

        market.ownerResolve(DAO, PROPOSAL_ID, MoralityPredictionMarket.Outcome.FOR);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim(DAO, PROPOSAL_ID);

        // Winner payout = 2 ETH pot - 2% fee on 1 ETH profit = 1.98 ETH
        assertEq(alice.balance, aliceBefore + 1.98 ether);

        vm.prank(bob);
        vm.expectRevert("Nothing to claim");
        market.claim(DAO, PROPOSAL_ID);
    }

    function test_claimWinningsAfterOnchainResolve() public {
        market.setDaoResolver(DAO, address(governorA), true);
        governorA.setProposalState(100, 1, true); // Active
        market.createMarket(DAO, PROPOSAL_ID);

        vm.prank(alice);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, true);

        vm.prank(bob);
        market.stake{value: 1 ether}(DAO, PROPOSAL_ID, false);

        governorA.setProposalState(100, 4, true); // Succeeded -> FOR
        market.resolve(DAO, PROPOSAL_ID);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        market.claim(DAO, PROPOSAL_ID);

        assertEq(alice.balance, aliceBefore + 1.98 ether);

        vm.prank(bob);
        vm.expectRevert("Nothing to claim");
        market.claim(DAO, PROPOSAL_ID);
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    function _proposalKey(string memory proposalId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(DAO, ":", proposalId));
    }
}
