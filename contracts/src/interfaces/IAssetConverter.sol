// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAssetConverter {
    function assetIn() external view returns (address);
    function bridgeAsset() external view returns (address);
    function previewToBridgeAsset(uint256 amountIn) external view returns (uint256 amountOut);
    function previewToVaultAsset(uint256 amountIn) external view returns (uint256 amountOut);
    function convertToBridgeAsset(uint256 amountIn, address receiver, bytes32 quoteId) external returns (uint256 amountOut);
    function convertToVaultAsset(uint256 amountIn, address receiver, bytes32 quoteId) external returns (uint256 amountOut);
}
