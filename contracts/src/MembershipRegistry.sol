// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title MembershipRegistry
/// @notice Anonymous-membership registry for private ballots (Phase 2A of the
///         governance plan). Members register a Poseidon identity commitment;
///         an operator maintains the canonical Merkle root over the commitment
///         set off-chain and posts it here. Ballot contracts snapshot the root
///         per proposal, so votes prove membership without revealing WHO voted.
/// @dev    v1 gate is operator-approved registration (allowlist semantics per
///         the plan's "eligibility v1"); the ZK-KYC attestation pipeline swaps
///         in later without changing this interface. Root computation is
///         off-chain in v1 — an incremental Merkle tree (LeanIMT) can replace
///         `setRoot` onchain in a later upgrade slot-compatibly.
contract MembershipRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    /// @notice Poseidon identity commitments, append-only.
    uint256[] public commitments;

    /// @notice commitment => registered flag (prevents duplicates).
    mapping(uint256 => bool) public isRegistered;

    /// @notice Current canonical Merkle root over `commitments`.
    uint256 public membershipRoot;

    /// @notice Historic roots stay valid for ballots snapshotted against them.
    mapping(uint256 => bool) public knownRoot;

    /// @notice Address allowed to admit members + post roots (the operator).
    address public operator;

    event MemberRegistered(uint256 indexed commitment, uint256 index);
    event RootUpdated(uint256 indexed root, uint256 memberCount);
    event OperatorChanged(address indexed operator);

    error NotOperator();
    error AlreadyRegistered();
    error ZeroCommitment();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, address _operator) external initializer {
        __Ownable_init(_owner);
        __Pausable_init();
        operator = _operator;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner()) revert NotOperator();
        _;
    }

    /// @notice Admit a member's identity commitment. Operator-gated in v1;
    ///         the member's wallet never has to touch this contract, so the
    ///         onchain registration address is unlinkable to the identity.
    function register(uint256 commitment) external onlyOperator whenNotPaused {
        if (commitment == 0) revert ZeroCommitment();
        if (isRegistered[commitment]) revert AlreadyRegistered();
        isRegistered[commitment] = true;
        commitments.push(commitment);
        emit MemberRegistered(commitment, commitments.length - 1);
    }

    /// @notice Post the Merkle root over the current commitment set.
    function setRoot(uint256 root) external onlyOperator {
        membershipRoot = root;
        knownRoot[root] = true;
        emit RootUpdated(root, commitments.length);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit OperatorChanged(_operator);
    }

    function memberCount() external view returns (uint256) {
        return commitments.length;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
