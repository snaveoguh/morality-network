// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReserveAllocator {
    function deposit(uint256 assets) external returns (uint256 sharesOut);
    function withdraw(uint256 assets, address receiver) external returns (uint256 assetsOut);
    function totalManagedAssets() external view returns (uint256);
    function liquidatableAssets() external view returns (uint256);
}
