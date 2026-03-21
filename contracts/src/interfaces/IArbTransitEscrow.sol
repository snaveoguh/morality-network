// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArbTransitEscrow {
    function receiveBridge(bytes32 routeId, uint256 assets) external;
    function releaseToStrategy(bytes32 routeId, uint256 assets, address receiver) external;
    function receiveFromStrategy(bytes32 routeId, uint256 assets) external;
    function releaseToBridge(bytes32 routeId, uint256 assets, address receiver) external;
    function routeBalances(bytes32 routeId) external view returns (uint256);
}
