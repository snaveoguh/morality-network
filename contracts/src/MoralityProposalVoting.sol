// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MoralityProposalVoting
/// @notice Signal voting on DAO proposals. Noun holders get gas refund, everyone else pays.
/// @dev Votes are signal-only (off-chain aggregation). Not binding on the target DAO.

interface INounsToken {
    function balanceOf(address owner) external view returns (uint256);
}

contract MoralityProposalVoting {
    enum VoteType { AGAINST, FOR, ABSTAIN }

    struct Vote {
        VoteType support;
        string reason;
        uint256 timestamp;
    }

    struct ProposalVotes {
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        uint256 totalVoters;
    }

    // Nouns Token on Ethereum mainnet
    INounsToken public nounsToken;
    address public owner;

    // Max gas refund per vote (prevents abuse)
    uint256 public maxRefund = 0.01 ether;

    // proposalKey (keccak256 of dao+proposalId) => voter => Vote
    mapping(bytes32 => mapping(address => Vote)) public votes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    mapping(bytes32 => ProposalVotes) public proposalVotes;
    // Track all voters per proposal for enumeration
    mapping(bytes32 => address[]) public proposalVoters;

    event VoteCast(
        bytes32 indexed proposalKey,
        address indexed voter,
        VoteType support,
        bool isNounHolder,
        string reason
    );
    event RefundIssued(address indexed voter, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _nounsToken) {
        nounsToken = INounsToken(_nounsToken);
        owner = msg.sender;
    }

    /// @notice Cast a signal vote on a DAO proposal
    /// @param dao The DAO identifier (e.g., "nouns", "ens", "uniswap")
    /// @param proposalId The proposal ID within that DAO
    /// @param support 0=Against, 1=For, 2=Abstain
    /// @param reason Optional reason string
    function castVote(
        string calldata dao,
        string calldata proposalId,
        VoteType support,
        string calldata reason
    ) external {
        bytes32 proposalKey = keccak256(abi.encodePacked(dao, ":", proposalId));
        require(!hasVoted[proposalKey][msg.sender], "Already voted");

        uint256 startGas = gasleft();

        // Record vote
        votes[proposalKey][msg.sender] = Vote({
            support: support,
            reason: reason,
            timestamp: block.timestamp
        });
        hasVoted[proposalKey][msg.sender] = true;
        proposalVoters[proposalKey].push(msg.sender);

        // Update tallies
        if (support == VoteType.FOR) {
            proposalVotes[proposalKey].forVotes++;
        } else if (support == VoteType.AGAINST) {
            proposalVotes[proposalKey].againstVotes++;
        } else {
            proposalVotes[proposalKey].abstainVotes++;
        }
        proposalVotes[proposalKey].totalVoters++;

        emit VoteCast(proposalKey, msg.sender, support, _isNounHolder(msg.sender), reason);

        // Gas refund for Noun holders
        if (_isNounHolder(msg.sender)) {
            uint256 gasUsed = startGas - gasleft() + 30000; // +30k for refund overhead
            uint256 refund = gasUsed * tx.gasprice;
            if (refund > maxRefund) refund = maxRefund;
            if (address(this).balance >= refund) {
                (bool ok, ) = payable(msg.sender).call{value: refund}("");
                if (ok) emit RefundIssued(msg.sender, refund);
            }
        }
    }

    /// @notice Get vote tallies for a proposal
    function getProposalVotes(string calldata dao, string calldata proposalId)
        external view returns (uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint256 totalVoters)
    {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        ProposalVotes memory pv = proposalVotes[key];
        return (pv.forVotes, pv.againstVotes, pv.abstainVotes, pv.totalVoters);
    }

    /// @notice Check if an address has voted on a proposal
    function getVote(string calldata dao, string calldata proposalId, address voter)
        external view returns (VoteType support, string memory reason, uint256 timestamp, bool voted)
    {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        voted = hasVoted[key][voter];
        if (voted) {
            Vote memory v = votes[key][voter];
            return (v.support, v.reason, v.timestamp, true);
        }
        return (VoteType.AGAINST, "", 0, false);
    }

    function _isNounHolder(address addr) internal view returns (bool) {
        try nounsToken.balanceOf(addr) returns (uint256 bal) {
            return bal > 0;
        } catch {
            return false;
        }
    }

    /// @notice Update max refund amount
    function setMaxRefund(uint256 _maxRefund) external onlyOwner {
        maxRefund = _maxRefund;
    }

    /// @notice Fund the contract for gas refunds
    receive() external payable {}

    /// @notice Withdraw excess funds
    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }
}
