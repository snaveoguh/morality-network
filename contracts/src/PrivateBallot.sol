// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IGroth16Verifier.sol";

interface IMembershipRegistry {
    function membershipRoot() external view returns (uint256);
    function knownRoot(uint256 root) external view returns (bool);
}

/// @title PrivateBallot
/// @notice Anonymous member voting (Phase 2A). A vote is a Groth16 proof that
///         the voter's identity commitment is in the membership Merkle tree,
///         carrying a nullifier that prevents double votes — WITHOUT revealing
///         which member voted. Tally is public (coercion-resistant encrypted
///         tallies are Phase 2B / Enclave-CRISP).
/// @dev    Circuit: circuits/vote/vote.circom. Public signals layout:
///         [0] membershipRoot  — Merkle root the proof was built against
///         [1] nullifierHash   — H(identityNullifier, externalNullifier)
///         [2] voteSignal      — 0 = against, 1 = for, 2 = abstain
///         [3] externalNullifier — H(ballotId), binds proof to this ballot
contract PrivateBallot is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    struct Ballot {
        uint256 membershipRoot; // snapshotted at open
        uint64 openedAt;
        uint64 closesAt;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        bool exists;
    }

    IGroth16Verifier public verifier;
    IMembershipRegistry public registry;

    /// @notice ballotId (e.g. keccak of proposal id string) => ballot.
    mapping(uint256 => Ballot) public ballots;

    /// @notice ballotId => nullifierHash => spent.
    mapping(uint256 => mapping(uint256 => bool)) public nullifierSpent;

    event BallotOpened(uint256 indexed ballotId, uint256 membershipRoot, uint64 closesAt);
    event VoteCast(uint256 indexed ballotId, uint8 voteType, uint256 nullifierHash);

    error BallotExists();
    error BallotMissing();
    error BallotClosed();
    error UnknownRoot();
    error RootMismatch();
    error WrongBallot();
    error NullifierUsed();
    error InvalidProof();
    error InvalidVoteSignal();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, address _verifier, address _registry) external initializer {
        __Ownable_init(_owner);
        __Pausable_init();
        verifier = IGroth16Verifier(_verifier);
        registry = IMembershipRegistry(_registry);
    }

    /// @notice Open a ballot, snapshotting the current membership root.
    function openBallot(uint256 ballotId, uint64 closesAt) external onlyOwner whenNotPaused {
        if (ballots[ballotId].exists) revert BallotExists();
        uint256 root = registry.membershipRoot();
        ballots[ballotId] = Ballot({
            membershipRoot: root,
            openedAt: uint64(block.timestamp),
            closesAt: closesAt,
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            exists: true
        });
        emit BallotOpened(ballotId, root, closesAt);
    }

    /// @notice Cast an anonymous vote. Anyone may relay the tx — the proof is
    ///         the authorisation, so the sending address reveals nothing.
    function castVote(
        uint256 ballotId,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[4] calldata pubSignals
    ) external whenNotPaused {
        Ballot storage ballot = ballots[ballotId];
        if (!ballot.exists) revert BallotMissing();
        if (block.timestamp > ballot.closesAt) revert BallotClosed();

        uint256 root = pubSignals[0];
        uint256 nullifierHash = pubSignals[1];
        uint256 voteSignal = pubSignals[2];
        uint256 externalNullifier = pubSignals[3];

        if (root != ballot.membershipRoot) revert RootMismatch();
        if (!registry.knownRoot(root)) revert UnknownRoot();
        if (externalNullifier != uint256(keccak256(abi.encodePacked(ballotId))) % SNARK_SCALAR_FIELD) {
            revert WrongBallot();
        }
        if (nullifierSpent[ballotId][nullifierHash]) revert NullifierUsed();
        if (voteSignal > 2) revert InvalidVoteSignal();
        if (!verifier.verifyProof(pA, pB, pC, pubSignals)) revert InvalidProof();

        nullifierSpent[ballotId][nullifierHash] = true;
        if (voteSignal == 1) ballot.votesFor++;
        else if (voteSignal == 0) ballot.votesAgainst++;
        else ballot.votesAbstain++;

        emit VoteCast(ballotId, uint8(voteSignal), nullifierHash);
    }

    function getBallot(uint256 ballotId)
        external
        view
        returns (uint256 votesFor, uint256 votesAgainst, uint256 votesAbstain, uint64 closesAt, uint256 root)
    {
        Ballot storage b = ballots[ballotId];
        if (!b.exists) revert BallotMissing();
        return (b.votesFor, b.votesAgainst, b.votesAbstain, b.closesAt, b.membershipRoot);
    }

    /// @dev BN254 scalar field — external nullifiers must be field elements.
    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
