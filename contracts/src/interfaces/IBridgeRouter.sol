// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBridgeRouter {
    function bridgeToArbitrum(uint256 assets, bytes32 intentId) external returns (bytes32 routeId);
    function markReceivedOnArbitrum(bytes32 routeId) external;
    function markStrategyFunded(bytes32 routeId, bytes32 settlementId) external;
    function beginReturnFromStrategy(bytes32 routeId, uint256 assets, bytes32 settlementId) external;
    function setReturnBridgeAssets(bytes32 routeId, uint256 bridgeAssets) external;
    function finalizeReturnToBase(bytes32 routeId, bytes32 completionId) external;
    function markFailedRoute(bytes32 routeId, bytes32 completionId) external;
    function totalPendingAssets() external view returns (uint256);
    function getRoute(bytes32 routeId)
        external
        view
        returns (
            uint256 outboundAssets,
            uint256 returnAssets,
            uint64 createdAt,
            uint64 updatedAt,
            uint8 status,
            bytes32 intentId
        );
}
