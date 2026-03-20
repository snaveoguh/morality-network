// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title MoralityProposalVoting
/// @notice Signal voting on DAO proposals. Noun holders get gas refund, everyone else pays.
/// @dev Votes are signal-only (off-chain aggregation). Not binding on the target DAO.

interface INounsToken {
    function balanceOf(address owner) external view returns (uint256);
}

interface IProposalState {
    function state(uint256 proposalId) external view returns (uint8);
}

contract MoralityProposalVoting is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    enum VoteType { AGAINST, FOR, ABSTAIN }

    struct DaoResolverConfig {
        address governor;
        bool enabled;
    }

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

    // Max gas refund per vote (prevents abuse)
    uint256 public maxRefund;
    uint256 public constant MAX_REASON_LENGTH = 500;

    // proposalKey (keccak256 of dao+proposalId) => voter => Vote
    mapping(bytes32 => mapping(address => Vote)) public votes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;
    mapping(bytes32 => ProposalVotes) public proposalVotes;
    // Track all voters per proposal for enumeration
    mapping(bytes32 => address[]) public proposalVoters;
    // dao key hash => resolver config
    mapping(bytes32 => DaoResolverConfig) public daoResolverConfigs;

    event VoteCast(
        bytes32 indexed proposalKey,
        address indexed voter,
        VoteType support,
        bool isNounHolder,
        string reason
    );
    event RefundIssued(address indexed voter, uint256 amount);
    event DaoResolverSet(string dao, address indexed governor, bool enabled);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _nounsToken) public initializer {
        require(_nounsToken != address(0), "Nouns token required");
        __Ownable_init(msg.sender);
        __Pausable_init();
        nounsToken = INounsToken(_nounsToken);
        maxRefund = 0.01 ether;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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
    ) external whenNotPaused {
        require(bytes(reason).length <= MAX_REASON_LENGTH, "Reason too long");
        bytes32 proposalKey = keccak256(abi.encodePacked(dao, ":", proposalId));
        require(!hasVoted[proposalKey][msg.sender], "Already voted");

        uint256 startGas = gasleft();
        bool isNounHolder = _isNounHolder(msg.sender);
        bool refundEligible = isNounHolder && _isRefundEligible(dao, proposalId);

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

        emit VoteCast(proposalKey, msg.sender, support, isNounHolder, reason);

        // Gas refund for verified onchain-resolvable proposals only.
        if (refundEligible) {
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

    function _isRefundEligible(string calldata dao, string calldata proposalId) internal view returns (bool) {
        DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
        if (!cfg.enabled || cfg.governor == address(0)) return false;

        (uint256 proposalNumericId, bool okParse) = _tryParseUint(proposalId);
        if (!okParse) return false;

        try IProposalState(cfg.governor).state(proposalNumericId) returns (uint8) {
            return true;
        } catch {
            return false;
        }
    }

    function _tryParseUint(string calldata input) internal pure returns (uint256 value, bool ok) {
        bytes calldata b = bytes(input);
        if (b.length == 0) return (0, false);

        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57) return (0, false);
            value = (value * 10) + (c - 48);
        }
        return (value, true);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    /// @notice Update max refund amount
    function setMaxRefund(uint256 _maxRefund) external onlyOwner {
        maxRefund = _maxRefund;
    }

    /// @notice Configure which DAO proposal IDs can receive gas refunds.
    /// @dev Voting remains open for all keys; refunds are only for configured onchain resolvers.
    function setDaoResolver(string calldata dao, address governor, bool enabled) external onlyOwner {
        require(bytes(dao).length > 0, "DAO key required");
        if (enabled) {
            require(governor != address(0), "Governor required");
        }

        daoResolverConfigs[keccak256(bytes(dao))] = DaoResolverConfig({
            governor: governor,
            enabled: enabled
        });

        emit DaoResolverSet(dao, governor, enabled);
    }

    function isDaoResolvable(string calldata dao) external view returns (bool) {
        DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
        return cfg.enabled && cfg.governor != address(0);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Fund the contract for gas refunds (owner only)
    function fund() external payable onlyOwner {}

    /// @notice Withdraw excess funds
    function withdraw() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    // NOTE: receive() intentionally omitted — use fund() to add gas refund ETH.
    // This prevents accidental ETH sends from being permanently stuck.

    uint256[50] private __gap;
}
