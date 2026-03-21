// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBridgeAdapter {
    function bridgeAsset() external view returns (address);
    function bridgeOut(bytes32 routeId, uint256 amount, address receiver, bytes32 bridgeRef) external returns (bytes32 transferId);
    function completeInbound(bytes32 routeId, uint256 amount, address receiver, bytes32 completionId) external returns (uint256 assetsOut);
    function getOutbound(bytes32 routeId)
        external
        view
        returns (
            uint256 outboundAssets,
            uint256 inboundAssets,
            uint64 updatedAt,
            bool outboundComplete,
            bool inboundComplete,
            bytes32 lastRef
        );
}
