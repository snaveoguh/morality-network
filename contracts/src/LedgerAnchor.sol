// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LedgerAnchor
/// @notice Daily tamper-evidence anchor for the Claim Ledger. The offchain
///         pipeline batches each UTC day's claim hashes into a sha256 Merkle
///         root (web/src/lib/ledger/merkle.ts defines the leaf format) and
///         posts one root per day — one cheap tx, not one per claim.
///         Anyone holding a claim export can recompute the root and compare.
/// @dev    Deliberately minimal and non-upgradeable: the entire value of an
///         anchor is that it cannot be rewritten. A root, once set for a day,
///         is immutable. Deploy target: Base L2. Spec §Risks: this contract
///         is small enough to audit cheaply before the ledger makes enemies.
contract LedgerAnchor {
    address public immutable operator;

    /// @notice day (as YYYYMMDD integer, UTC) → Merkle root over that day's claims.
    mapping(uint256 => bytes32) public rootOf;

    event Anchored(uint256 indexed day, bytes32 root, uint256 claimCount);

    error NotOperator();
    error AlreadyAnchored(uint256 day);
    error EmptyRoot();

    constructor(address _operator) {
        operator = _operator == address(0) ? msg.sender : _operator;
    }

    /// @notice Anchor one day's root. Reverts if the day is already anchored —
    ///         history is append-only by construction.
    /// @param day        UTC day as YYYYMMDD (e.g. 20260710).
    /// @param root       sha256 Merkle root over the day's claim leaves.
    /// @param claimCount number of claims in the batch (event metadata).
    function anchor(uint256 day, bytes32 root, uint256 claimCount) external {
        if (msg.sender != operator) revert NotOperator();
        if (root == bytes32(0)) revert EmptyRoot();
        if (rootOf[day] != bytes32(0)) revert AlreadyAnchored(day);
        rootOf[day] = root;
        emit Anchored(day, root, claimCount);
    }
}
