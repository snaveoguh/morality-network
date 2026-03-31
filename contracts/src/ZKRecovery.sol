// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IGroth16Verifier.sol";

/**
 * @title ZKRecovery
 * @author pooter.world
 * @notice Cross-chain ZK password recovery for self-custody wallets.
 *
 *  A user sets a recovery password at wallet creation. The Poseidon hash
 *  commitment is stored on-chain. To recover, the user generates a Groth16
 *  ZK proof that they know the password, without revealing it. A 24-hour
 *  timelock allows the original owner to cancel fraudulent recovery attempts.
 *
 *  Novel contribution: First cross-chain ZK password recovery. Same commitment
 *  works on both EVM (Base) and Solana via shared BN254/Poseidon primitives.
 *  No seed phrases, no trusted parties, no custodial risk.
 *
 * @dev Follows UUPS upgradeable pattern consistent with MoralityRegistry et al.
 */
contract ZKRecovery is Initializable, UUPSUpgradeable, OwnableUpgradeable {

    // ═══════════════════════════════════════════════════════════════════
    //  Types
    // ═══════════════════════════════════════════════════════════════════

    struct RecoveryCommitment {
        bytes32 commitment;          // Poseidon(password, salt)
        uint8   circuitType;         // 0 = single-factor, 1 = MFA (future)
        uint64  nonce;               // Incremented after each valid proof
        uint64  failedAttempts;      // Rate limiting counter
        uint64  lastAttemptTimestamp; // For cooldown calculation
        bool    exists;
    }

    struct PendingRecovery {
        address newAddress;          // Recovery target
        uint256 executeAfter;        // block.timestamp + TIMELOCK_DURATION
        bool    exists;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Constants
    // ═══════════════════════════════════════════════════════════════════

    uint256 public constant TIMELOCK_DURATION = 24 hours;
    uint256 public constant COOLDOWN_PER_ATTEMPT = 1 hours;
    uint64  public constant MAX_ATTEMPTS_BEFORE_LOCK = 5;
    uint256 public constant VERSION = 1;

    // ═══════════════════════════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════════════════════════

    IGroth16Verifier public verifier;
    IGroth16Verifier public mfaVerifier; // Optional, set later for MFA circuit

    mapping(address => RecoveryCommitment) public commitments;
    mapping(address => PendingRecovery) public pendingRecoveries;

    uint256[45] private __gap; // Upgrade safety

    // ═══════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════

    event CommitmentRegistered(address indexed owner, bytes32 commitment, uint8 circuitType);
    event CommitmentUpdated(address indexed owner, bytes32 oldCommitment, bytes32 newCommitment);
    event CommitmentRevoked(address indexed owner);
    event RecoveryInitiated(
        address indexed owner,
        address indexed newAddress,
        uint256 executeAfter,
        uint64 nonce
    );
    event RecoveryCancelled(address indexed owner);
    event RecoveryExecuted(address indexed oldAddress, address indexed newAddress);
    event RecoveryFailed(address indexed owner, uint64 failedAttempts);

    // ═══════════════════════════════════════════════════════════════════
    //  Errors
    // ═══════════════════════════════════════════════════════════════════

    error CommitmentAlreadyExists();
    error CommitmentNotFound();
    error PendingRecoveryExists();
    error NoPendingRecovery();
    error TimelockNotExpired();
    error InvalidProof();
    error RateLimited();
    error AccountLocked();
    error InvalidAddress();
    error NotCommitmentOwner();

    // ═══════════════════════════════════════════════════════════════════
    //  Initializer
    // ═══════════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _verifier) public initializer {
        __Ownable_init(msg.sender);
        // UUPSUpgradeable has no initializer in this OZ version (no-op)
        verifier = IGroth16Verifier(_verifier);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════════
    //  Commitment Management
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Register a ZK recovery commitment for msg.sender.
     * @param _commitment Poseidon(password, salt) computed client-side
     * @param _circuitType 0 for single-factor, 1 for MFA (future)
     */
    function registerCommitment(bytes32 _commitment, uint8 _circuitType) external {
        if (commitments[msg.sender].exists) revert CommitmentAlreadyExists();
        if (_commitment == bytes32(0)) revert InvalidAddress();

        commitments[msg.sender] = RecoveryCommitment({
            commitment: _commitment,
            circuitType: _circuitType,
            nonce: 0,
            failedAttempts: 0,
            lastAttemptTimestamp: 0,
            exists: true
        });

        emit CommitmentRegistered(msg.sender, _commitment, _circuitType);
    }

    /**
     * @notice Update recovery password (rotate commitment).
     * @param _newCommitment New Poseidon(newPassword, newSalt)
     */
    function updateCommitment(bytes32 _newCommitment) external {
        RecoveryCommitment storage c = commitments[msg.sender];
        if (!c.exists) revert CommitmentNotFound();
        if (pendingRecoveries[msg.sender].exists) revert PendingRecoveryExists();
        if (_newCommitment == bytes32(0)) revert InvalidAddress();

        bytes32 old = c.commitment;
        c.commitment = _newCommitment;
        c.nonce += 1; // Invalidate any proofs generated with old commitment
        c.failedAttempts = 0; // Reset rate limiting
        c.lastAttemptTimestamp = 0;

        emit CommitmentUpdated(msg.sender, old, _newCommitment);
    }

    /**
     * @notice Revoke recovery commitment entirely.
     */
    function revokeCommitment() external {
        if (!commitments[msg.sender].exists) revert CommitmentNotFound();
        delete commitments[msg.sender];
        delete pendingRecoveries[msg.sender];
        emit CommitmentRevoked(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Recovery Flow
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Initiate wallet recovery by proving password knowledge via ZK proof.
     * @dev Anyone can call this (the recovering user may not have the owner's keys).
     *      The proof must be valid for the owner's commitment with the correct nonce.
     *      Starts a 24-hour timelock during which the original owner can cancel.
     *
     * @param _owner       Address of the wallet being recovered
     * @param _newAddress  Address that will be authorized after timelock
     * @param _pA          Groth16 proof element A
     * @param _pB          Groth16 proof element B
     * @param _pC          Groth16 proof element C
     */
    function initiateRecovery(
        address _owner,
        address _newAddress,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC
    ) external {
        if (_newAddress == address(0)) revert InvalidAddress();
        if (_newAddress == _owner) revert InvalidAddress();

        RecoveryCommitment storage c = commitments[_owner];
        if (!c.exists) revert CommitmentNotFound();
        if (pendingRecoveries[_owner].exists) revert PendingRecoveryExists();

        // ── Rate limiting ─────────────────────────────────────────
        if (c.failedAttempts >= MAX_ATTEMPTS_BEFORE_LOCK) revert AccountLocked();

        if (c.failedAttempts > 0) {
            uint256 requiredCooldown = uint256(c.failedAttempts) * COOLDOWN_PER_ATTEMPT;
            if (block.timestamp < c.lastAttemptTimestamp + requiredCooldown) {
                revert RateLimited();
            }
        }

        // ── Construct public inputs ───────────────────────────────
        // Must match circuit's public input order:
        // [commitment, newAddress, chainId, nonce]
        uint[4] memory pubSignals;
        pubSignals[0] = uint256(c.commitment);
        pubSignals[1] = uint256(uint160(_newAddress));
        pubSignals[2] = block.chainid;
        pubSignals[3] = uint256(c.nonce);

        // ── Verify ZK proof ───────────────────────────────────────
        bool valid = verifier.verifyProof(_pA, _pB, _pC, pubSignals);

        if (!valid) {
            c.failedAttempts += 1;
            c.lastAttemptTimestamp = uint64(block.timestamp);
            emit RecoveryFailed(_owner, c.failedAttempts);
            revert InvalidProof();
        }

        // ── Proof valid — start timelock ──────────────────────────
        c.nonce += 1; // Prevent proof replay
        c.failedAttempts = 0; // Reset on success

        uint256 executeAfter = block.timestamp + TIMELOCK_DURATION;
        pendingRecoveries[_owner] = PendingRecovery({
            newAddress: _newAddress,
            executeAfter: executeAfter,
            exists: true
        });

        emit RecoveryInitiated(_owner, _newAddress, executeAfter, c.nonce);
    }

    /**
     * @notice Cancel a pending recovery. Only the original owner can call this.
     * @dev This is the primary defense against compromised proofs.
     *      The owner has 24 hours to notice and cancel.
     */
    function cancelRecovery() external {
        if (!pendingRecoveries[msg.sender].exists) revert NoPendingRecovery();
        delete pendingRecoveries[msg.sender];
        emit RecoveryCancelled(msg.sender);
    }

    /**
     * @notice Execute a recovery after the timelock has expired.
     * @dev Permissionless — anyone can call this. The recovering user
     *      does not need access to the original owner's keys.
     *
     * @param _owner Address of the wallet being recovered
     */
    function executeRecovery(address _owner) external {
        PendingRecovery storage p = pendingRecoveries[_owner];
        if (!p.exists) revert NoPendingRecovery();
        if (block.timestamp < p.executeAfter) revert TimelockNotExpired();

        address newAddress = p.newAddress;
        delete pendingRecoveries[_owner];

        // Transfer the commitment to the new address
        RecoveryCommitment memory oldCommitment = commitments[_owner];
        delete commitments[_owner];

        commitments[newAddress] = RecoveryCommitment({
            commitment: oldCommitment.commitment,
            circuitType: oldCommitment.circuitType,
            nonce: oldCommitment.nonce,
            failedAttempts: 0,
            lastAttemptTimestamp: 0,
            exists: true
        });

        emit RecoveryExecuted(_owner, newAddress);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set the MFA verifier contract (for future multi-factor circuit).
     */
    function setMfaVerifier(address _mfaVerifier) external onlyOwner {
        mfaVerifier = IGroth16Verifier(_mfaVerifier);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Views
    // ═══════════════════════════════════════════════════════════════════

    function getCommitment(address _owner) external view returns (RecoveryCommitment memory) {
        return commitments[_owner];
    }

    function getPendingRecovery(address _owner) external view returns (PendingRecovery memory) {
        return pendingRecoveries[_owner];
    }

    function isRecoverable(address _owner) external view returns (bool) {
        return commitments[_owner].exists;
    }

    function isLocked(address _owner) external view returns (bool) {
        return commitments[_owner].failedAttempts >= MAX_ATTEMPTS_BEFORE_LOCK;
    }

    function cooldownRemaining(address _owner) external view returns (uint256) {
        RecoveryCommitment memory c = commitments[_owner];
        if (c.failedAttempts == 0) return 0;
        uint256 requiredCooldown = uint256(c.failedAttempts) * COOLDOWN_PER_ATTEMPT;
        uint256 cooldownEnd = c.lastAttemptTimestamp + requiredCooldown;
        if (block.timestamp >= cooldownEnd) return 0;
        return cooldownEnd - block.timestamp;
    }
}
