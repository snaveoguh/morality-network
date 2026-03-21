// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBaseCapitalVault {
    function asset() external view returns (address);
    function bridgeOutToRouter(uint256 assets, bytes32 routeId, address receiver) external;
    function markBridgeReturned(uint256 assets, bytes32 routeId) external;
    function settleBridgeReturn(uint256 pendingReduction, uint256 liquidIncrease, bytes32 routeId) external;
    function markBridgeDeliveredToStrategy(uint256 assets, bytes32 settlementId) external;
    function markStrategyReturnPending(uint256 assets, bytes32 settlementId) external;
    function settleDailyNav(
        uint256 strategyAssetsEth,
        uint256 reserveAssetsEth,
        uint256 pendingBridgeEth,
        uint256 feesEth,
        bytes32 navHash
    ) external;
}
