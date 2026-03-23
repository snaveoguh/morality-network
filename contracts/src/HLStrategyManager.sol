// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IArbTransitEscrow} from "./interfaces/IArbTransitEscrow.sol";

contract HLStrategyManager is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    struct StrategyRouteState {
        uint256 releasedAssets;
        uint256 deployedAssets;
        uint256 returnedAssets;
        uint64 lastUpdatedAt;
        bytes32 lastExternalRef;
        bool returnSignaled;
    }

    address public asset;
    address public transitEscrow;
    address public operator;
    address public strategyHotWallet;
    uint256 public totalDeployedAssets;

    mapping(bytes32 => StrategyRouteState) private routeStates;

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event StrategyHotWalletUpdated(address indexed previousWallet, address indexed nextWallet);
    event TransitEscrowUpdated(address indexed previousEscrow, address indexed nextEscrow);
    event RouteReleasedToHotWallet(bytes32 indexed routeId, uint256 assets);
    event HyperliquidDeploymentRecorded(bytes32 indexed routeId, uint256 assets, bytes32 indexed externalRef);
    event RouteReturnedToEscrow(bytes32 indexed routeId, uint256 assets, bytes32 indexed externalRef);
    event ReturnSignaled(bytes32 indexed routeId, uint256 assets, bytes32 indexed settlementId);
    event DeployedAssetsUnderflow(bytes32 indexed routeId, uint256 returnedAssets, uint256 previousDeployed);

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address asset_,
        address transitEscrow_,
        address operator_,
        address strategyHotWallet_
    ) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(asset_ != address(0), "Zero asset");
        require(transitEscrow_ != address(0), "Zero escrow");
        require(operator_ != address(0), "Zero operator");
        require(strategyHotWallet_ != address(0), "Zero wallet");

        __Ownable_init(owner_);
        __Pausable_init();
        asset = asset_;
        transitEscrow = transitEscrow_;
        operator = operator_;
        strategyHotWallet = strategyHotWallet_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function releaseRouteToHotWallet(bytes32 routeId, uint256 assets) external onlyOperator whenNotPaused {
        require(assets > 0, "Zero assets");
        IArbTransitEscrow(transitEscrow).releaseToStrategy(routeId, assets, strategyHotWallet);
        StrategyRouteState storage state = routeStates[routeId];
        state.releasedAssets += assets;
        state.lastUpdatedAt = uint64(block.timestamp);
        emit RouteReleasedToHotWallet(routeId, assets);
    }

    /// @notice Records an off-chain Hyperliquid deployment for bookkeeping purposes.
    /// @dev M-18: This is pure bookkeeping — no actual token transfer or on-chain verification
    ///      occurs. The operator attests that `assets` have been deployed to Hyperliquid off-chain.
    ///      The only on-chain invariant enforced is that cumulative deployedAssets cannot exceed
    ///      releasedAssets for the route. There is no verification that tokens were actually
    ///      deposited into a Hyperliquid vault or that `externalRef` corresponds to a real
    ///      Hyperliquid transaction. Accuracy depends entirely on the trusted operator.
    /// @param routeId The route identifier for this deployment
    /// @param assets The amount of assets attested as deployed to Hyperliquid
    /// @param externalRef An off-chain reference (e.g. Hyperliquid deposit tx hash)
    function recordHyperliquidDeployment(bytes32 routeId, uint256 assets, bytes32 externalRef) external onlyOperator whenNotPaused {
        require(assets > 0, "Zero assets");
        StrategyRouteState storage state = routeStates[routeId];
        require(state.deployedAssets + assets <= state.releasedAssets, "Insufficient released assets");
        state.deployedAssets += assets;
        state.lastUpdatedAt = uint64(block.timestamp);
        state.lastExternalRef = externalRef;
        totalDeployedAssets += assets;
        emit HyperliquidDeploymentRecorded(routeId, assets, externalRef);
    }

    function pullbackToTransitEscrow(bytes32 routeId, uint256 assets, bytes32 externalRef) external onlyOperator whenNotPaused {
        require(assets > 0, "Zero assets");
        require(IERC20(asset).transferFrom(strategyHotWallet, address(this), assets), "Transfer failed");
        require(IERC20(asset).approve(transitEscrow, 0), "Approve reset failed");
        require(IERC20(asset).approve(transitEscrow, assets), "Approve failed");
        IArbTransitEscrow(transitEscrow).receiveFromStrategy(routeId, assets);

        StrategyRouteState storage state = routeStates[routeId];
        state.returnedAssets += assets;
        state.lastUpdatedAt = uint64(block.timestamp);
        state.lastExternalRef = externalRef;
        state.returnSignaled = false;
        if (assets >= totalDeployedAssets) {
            emit DeployedAssetsUnderflow(routeId, assets, totalDeployedAssets);
            totalDeployedAssets = 0;
        } else {
            totalDeployedAssets -= assets;
        }

        emit RouteReturnedToEscrow(routeId, assets, externalRef);
    }

    function signalReturnToBase(bytes32 routeId, uint256 assets, bytes32 settlementId) external onlyOperator whenNotPaused {
        require(assets > 0, "Zero assets");
        StrategyRouteState storage state = routeStates[routeId];
        require(state.returnedAssets >= assets, "Insufficient returned assets");
        state.returnSignaled = true;
        state.lastUpdatedAt = uint64(block.timestamp);
        state.lastExternalRef = settlementId;
        emit ReturnSignaled(routeId, assets, settlementId);
    }

    function getRouteState(bytes32 routeId)
        external
        view
        returns (
            uint256 releasedAssets,
            uint256 deployedAssets,
            uint256 returnedAssets,
            uint64 lastUpdatedAt,
            bytes32 lastExternalRef,
            bool returnSignaled
        )
    {
        StrategyRouteState storage state = routeStates[routeId];
        return (
            state.releasedAssets,
            state.deployedAssets,
            state.returnedAssets,
            state.lastUpdatedAt,
            state.lastExternalRef,
            state.returnSignaled
        );
    }

    function setOperator(address nextOperator) external onlyOwner {
        require(nextOperator != address(0), "Zero operator");
        emit OperatorUpdated(operator, nextOperator);
        operator = nextOperator;
    }

    function setStrategyHotWallet(address nextWallet) external onlyOwner {
        require(nextWallet != address(0), "Zero wallet");
        emit StrategyHotWalletUpdated(strategyHotWallet, nextWallet);
        strategyHotWallet = nextWallet;
    }

    function setTransitEscrow(address nextEscrow) external onlyOwner {
        require(nextEscrow != address(0), "Zero escrow");
        emit TransitEscrowUpdated(transitEscrow, nextEscrow);
        transitEscrow = nextEscrow;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[40] private __gap;
}
