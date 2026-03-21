// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IWithdrawalQueue {
    function enqueue(
        address owner,
        address receiver,
        uint256 shares,
        uint256 assetsRequested
    ) external returns (uint256 requestId);

    function markFulfilled(uint256 requestId, uint256 assetsOut) external;

    function cancel(uint256 requestId) external;

    function getRequest(uint256 requestId)
        external
        view
        returns (
            address owner,
            address receiver,
            uint256 shares,
            uint256 assetsRequested,
            uint256 assetsFulfilled,
            uint64 createdAt,
            bool finalized
        );
}
