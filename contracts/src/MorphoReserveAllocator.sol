// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IReserveAllocator} from "./interfaces/IReserveAllocator.sol";

/// @title MorphoReserveAllocator
/// @notice Generic ERC4626 reserve adapter intended for Morpho-style vaults.
contract MorphoReserveAllocator is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IReserveAllocator {
    address public vault;
    address public asset;
    address public targetVault;
    uint256 public totalPrincipal;

    event VaultUpdated(address indexed previousVault, address indexed nextVault);
    event TargetVaultUpdated(address indexed previousTarget, address indexed nextTarget);
    event DepositedToReserve(uint256 assets, uint256 sharesOut);
    event WithdrawnFromReserve(uint256 requestedAssets, uint256 assetsOut, address indexed receiver);
    event PartialWithdrawal(uint256 requested, uint256 received, address indexed receiver);

    modifier onlyVault() {
        require(msg.sender == vault, "Not vault");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address vault_, address asset_, address targetVault_) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(vault_ != address(0), "Zero vault");
        require(asset_ != address(0), "Zero asset");
        require(targetVault_ != address(0), "Zero target");

        __Ownable_init(owner_);
        __Pausable_init();
        vault = vault_;
        asset = asset_;
        targetVault = targetVault_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function deposit(uint256 assets) external onlyVault whenNotPaused returns (uint256 sharesOut) {
        require(assets > 0, "Zero assets");
        require(IERC20(asset).transferFrom(vault, address(this), assets), "Transfer failed");
        require(IERC20(asset).approve(targetVault, 0), "Approve reset failed");
        require(IERC20(asset).approve(targetVault, assets), "Approve failed");

        sharesOut = IERC4626(targetVault).deposit(assets, address(this));
        totalPrincipal += assets;

        emit DepositedToReserve(assets, sharesOut);
    }

    function withdraw(uint256 assets, address receiver) external onlyVault whenNotPaused returns (uint256 assetsOut) {
        require(assets > 0, "Zero assets");
        require(receiver != address(0), "Zero receiver");

        uint256 idle = IERC20(asset).balanceOf(address(this));
        if (idle >= assets) {
            require(IERC20(asset).transfer(receiver, assets), "Transfer failed");
            assetsOut = assets;
        } else {
            uint256 balBefore = IERC20(asset).balanceOf(receiver);
            if (idle > 0) {
                require(IERC20(asset).transfer(receiver, idle), "Transfer failed");
            }

            uint256 remaining = assets - idle;
            IERC4626(targetVault).withdraw(remaining, receiver, address(this));
            uint256 balAfter = IERC20(asset).balanceOf(receiver);
            assetsOut = balAfter - balBefore;
        }

        uint256 principalReduction = assetsOut > totalPrincipal ? totalPrincipal : assetsOut;
        if (principalReduction >= totalPrincipal) {
            totalPrincipal = 0;
        } else {
            totalPrincipal -= principalReduction;
        }

        if (assetsOut < assets) {
            emit PartialWithdrawal(assets, assetsOut, receiver);
        }

        emit WithdrawnFromReserve(assets, assetsOut, receiver);
    }

    function totalManagedAssets() public view returns (uint256) {
        uint256 idle = IERC20(asset).balanceOf(address(this));
        uint256 shares = IERC20(targetVault).balanceOf(address(this));
        uint256 invested = shares == 0 ? 0 : IERC4626(targetVault).previewRedeem(shares);
        return idle + invested;
    }

    function liquidatableAssets() external view returns (uint256) {
        return totalManagedAssets();
    }

    function setVault(address nextVault) external onlyOwner {
        require(nextVault != address(0), "Zero vault");
        emit VaultUpdated(vault, nextVault);
        vault = nextVault;
    }

    function setTargetVault(address nextTarget) external onlyOwner {
        require(nextTarget != address(0), "Zero target");
        // Prevent orphaning funds in old vault
        uint256 oldShares = IERC20(targetVault).balanceOf(address(this));
        require(oldShares == 0, "Withdraw from old vault first");
        emit TargetVaultUpdated(targetVault, nextTarget);
        targetVault = nextTarget;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[40] private __gap;
}
