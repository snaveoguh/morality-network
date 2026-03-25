// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IZKRecovery {
    struct RecoveryCommitment {
        bytes32 commitment;
        uint8   circuitType;
        uint64  nonce;
        uint64  failedAttempts;
        uint64  lastAttemptTimestamp;
        bool    exists;
    }

    struct PendingRecovery {
        address newAddress;
        uint256 executeAfter;
        bool    exists;
    }

    function registerCommitment(bytes32 _commitment, uint8 _circuitType) external;
    function updateCommitment(bytes32 _newCommitment) external;
    function revokeCommitment() external;

    function initiateRecovery(
        address _owner,
        address _newAddress,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC
    ) external;
    function cancelRecovery() external;
    function executeRecovery(address _owner) external;

    function getCommitment(address _owner) external view returns (RecoveryCommitment memory);
    function getPendingRecovery(address _owner) external view returns (PendingRecovery memory);
    function isRecoverable(address _owner) external view returns (bool);
    function isLocked(address _owner) external view returns (bool);
    function cooldownRemaining(address _owner) external view returns (uint256);
}
