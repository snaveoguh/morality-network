// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IAssetConverter} from "./interfaces/IAssetConverter.sol";
import {IBaseCapitalVault} from "./interfaces/IBaseCapitalVault.sol";
import {IBridgeAdapter} from "./interfaces/IBridgeAdapter.sol";
import {IBridgeRouter} from "./interfaces/IBridgeRouter.sol";

contract BridgeRouter is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IBridgeRouter {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    enum RouteStatus {
        None,
        Pending,
        ReceivedOnArb,
        DeployedToHl,
        ReturnPending,
        Returned,
        Failed
    }

    struct Route {
        uint256 outboundAssets;
        uint256 bridgeOutboundAssets;
        uint256 returnAssets;
        uint256 bridgeReturnAssets;
        uint64 createdAt;
        uint64 updatedAt;
        bytes32 intentId;
        RouteStatus status;
    }

    address public vault;
    address public asset;
    address public bridgeAsset;
    address public operator;
    address public bridgeExecutor;
    address public arbEscrow;
    address public assetConverter;
    address public bridgeAdapter;
    uint256 public totalPendingAssets;
    uint256 public nextRouteNonce;
    uint16 public minReturnBps;

    mapping(bytes32 => Route) private routes;

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event BridgeExecutorUpdated(address indexed previousExecutor, address indexed nextExecutor);
    event ArbEscrowUpdated(address indexed previousEscrow, address indexed nextEscrow);
    event BridgeAssetUpdated(address indexed previousAsset, address indexed nextAsset);
    event AssetConverterUpdated(address indexed previousConverter, address indexed nextConverter);
    event BridgeAdapterUpdated(address indexed previousAdapter, address indexed nextAdapter);
    event RouteCreated(bytes32 indexed routeId, bytes32 indexed intentId, uint256 assets);
    event RouteReceivedOnArb(bytes32 indexed routeId);
    event RouteDeployedToHl(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 assets, uint256 bridgeAssets);
    event RouteReturnPending(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 assets);
    event RouteReturnBridgeAssetsUpdated(bytes32 indexed routeId, uint256 bridgeAssets);
    event RouteReturned(bytes32 indexed routeId, bytes32 indexed completionId, uint256 assets, uint256 bridgeAssets);
    event RouteFailed(bytes32 indexed routeId, bytes32 indexed completionId, uint256 assets, uint256 bridgeAssets);

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    modifier onlyBridgeExecutor() {
        require(msg.sender == bridgeExecutor, "Not bridge executor");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address vault_,
        address asset_,
        address operator_,
        address bridgeExecutor_,
        address arbEscrow_
    ) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(vault_ != address(0), "Zero vault");
        require(asset_ != address(0), "Zero asset");
        require(operator_ != address(0), "Zero operator");
        require(bridgeExecutor_ != address(0), "Zero executor");

        __Ownable_init(owner_);
        __Pausable_init();
        vault = vault_;
        asset = asset_;
        bridgeAsset = asset_;
        operator = operator_;
        bridgeExecutor = bridgeExecutor_;
        arbEscrow = arbEscrow_;
        nextRouteNonce = 1;
        minReturnBps = 9_500; // 95% default
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function bridgeToArbitrum(uint256 assets, bytes32 intentId) external onlyOperator whenNotPaused returns (bytes32 routeId) {
        require(assets > 0, "Zero assets");

        uint256 nonce = nextRouteNonce++;
        routeId = keccak256(abi.encode(address(this), block.chainid, nonce, intentId));
        require(routes[routeId].status == RouteStatus.None, "Route exists");

        routes[routeId] = Route({
            outboundAssets: assets,
            bridgeOutboundAssets: 0,
            returnAssets: 0,
            bridgeReturnAssets: 0,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            intentId: intentId,
            status: RouteStatus.Pending
        });

        IBaseCapitalVault(vault).bridgeOutToRouter(assets, routeId, address(this));
        uint256 bridgeAmount = _convertToBridgeAsset(assets, routeId);
        routes[routeId].bridgeOutboundAssets = bridgeAmount;
        _bridgeOut(routeId, bridgeAmount);
        totalPendingAssets += assets;

        emit RouteCreated(routeId, intentId, assets);
    }

    function markReceivedOnArbitrum(bytes32 routeId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.Pending, "Bad route state");
        route.status = RouteStatus.ReceivedOnArb;
        route.updatedAt = uint64(block.timestamp);
        emit RouteReceivedOnArb(routeId);
    }

    function markStrategyFunded(bytes32 routeId, bytes32 settlementId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.ReceivedOnArb, "Bad route state");

        route.status = RouteStatus.DeployedToHl;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets -= route.outboundAssets;
        IBaseCapitalVault(vault).markBridgeDeliveredToStrategy(route.outboundAssets, settlementId);

        emit RouteDeployedToHl(routeId, settlementId, route.outboundAssets, route.bridgeOutboundAssets);
    }

    function beginReturnFromStrategy(
        bytes32 routeId,
        uint256 assets,
        bytes32 settlementId
    ) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.DeployedToHl, "Bad route state");
        require(assets > 0, "Zero assets");

        route.returnAssets = assets;
        route.status = RouteStatus.ReturnPending;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets += assets;
        IBaseCapitalVault(vault).markStrategyReturnPending(assets, settlementId);

        emit RouteReturnPending(routeId, settlementId, assets);
    }

    function setReturnBridgeAssets(bytes32 routeId, uint256 bridgeAssets_) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.ReturnPending, "Bad route state");
        require(bridgeAssets_ > 0, "Zero assets");
        route.bridgeReturnAssets = bridgeAssets_;
        route.updatedAt = uint64(block.timestamp);
        emit RouteReturnBridgeAssetsUpdated(routeId, bridgeAssets_);
    }

    function finalizeReturnToBase(bytes32 routeId, bytes32 completionId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.ReturnPending, "Bad route state");
        require(route.returnAssets > 0, "No return assets");

        uint256 bridgeAssets = route.bridgeReturnAssets > 0 ? route.bridgeReturnAssets : route.bridgeOutboundAssets;
        uint256 assetsOut = _completeInbound(routeId, bridgeAssets, completionId);

        route.status = RouteStatus.Returned;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets -= route.returnAssets;
        IBaseCapitalVault(vault).settleBridgeReturn(route.returnAssets, assetsOut, completionId);

        emit RouteReturned(routeId, completionId, assetsOut, bridgeAssets);
    }

    function markFailedRoute(bytes32 routeId, bytes32 completionId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.Pending || route.status == RouteStatus.ReceivedOnArb, "Bad route state");

        uint256 bridgeAssets = route.bridgeOutboundAssets > 0 ? route.bridgeOutboundAssets : route.outboundAssets;
        uint256 assetsOut = _completeInbound(routeId, bridgeAssets, completionId);

        route.status = RouteStatus.Failed;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets -= route.outboundAssets;
        IBaseCapitalVault(vault).settleBridgeReturn(route.outboundAssets, assetsOut, completionId);

        emit RouteFailed(routeId, completionId, assetsOut, bridgeAssets);
    }

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
        )
    {
        Route storage route = routes[routeId];
        return (
            route.outboundAssets,
            route.returnAssets,
            route.createdAt,
            route.updatedAt,
            uint8(route.status),
            route.intentId
        );
    }

    function setOperator(address nextOperator) external onlyOwner {
        require(nextOperator != address(0), "Zero operator");
        emit OperatorUpdated(operator, nextOperator);
        operator = nextOperator;
    }

    function setBridgeExecutor(address nextExecutor) external onlyOwner {
        require(nextExecutor != address(0), "Zero executor");
        emit BridgeExecutorUpdated(bridgeExecutor, nextExecutor);
        bridgeExecutor = nextExecutor;
    }

    function setArbEscrow(address nextEscrow) external onlyOwner {
        emit ArbEscrowUpdated(arbEscrow, nextEscrow);
        arbEscrow = nextEscrow;
    }

    function setBridgeAsset(address nextAsset) external onlyOwner {
        require(nextAsset != address(0), "Zero asset");
        emit BridgeAssetUpdated(bridgeAsset, nextAsset);
        bridgeAsset = nextAsset;
    }

    function setAssetConverter(address nextConverter) external onlyOwner {
        emit AssetConverterUpdated(assetConverter, nextConverter);
        assetConverter = nextConverter;
    }

    function setBridgeAdapter(address nextAdapter) external onlyOwner {
        emit BridgeAdapterUpdated(bridgeAdapter, nextAdapter);
        bridgeAdapter = nextAdapter;
    }

    function setMinReturnBps(uint16 nextMinReturn) external onlyOwner {
        require(nextMinReturn <= BPS_DENOMINATOR, "Bad bps");
        minReturnBps = nextMinReturn;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _bridgeOut(bytes32 routeId, uint256 amount) internal {
        if (bridgeAdapter != address(0)) {
            require(IERC20(bridgeAsset).approve(bridgeAdapter, 0), "Approve reset failed");
            require(IERC20(bridgeAsset).approve(bridgeAdapter, amount), "Approve failed");
            IBridgeAdapter(bridgeAdapter).bridgeOut(routeId, amount, bridgeExecutor, routeId);
            return;
        }

        require(IERC20(bridgeAsset).transfer(bridgeExecutor, amount), "Transfer failed");
    }

    function _convertToBridgeAsset(uint256 amount, bytes32 routeId) internal returns (uint256 bridgeAmount) {
        if (assetConverter == address(0) || bridgeAsset == asset) {
            return amount;
        }

        require(IERC20(asset).approve(assetConverter, 0), "Approve reset failed");
        require(IERC20(asset).approve(assetConverter, amount), "Approve failed");
        return IAssetConverter(assetConverter).convertToBridgeAsset(amount, address(this), routeId);
    }

    function _completeInbound(bytes32 routeId, uint256 bridgeAssets, bytes32 completionId) internal returns (uint256 assetsOut) {
        uint256 bridgeAmountOut = bridgeAssets;
        if (bridgeAdapter != address(0)) {
            bridgeAmountOut = IBridgeAdapter(bridgeAdapter).completeInbound(routeId, bridgeAssets, address(this), completionId);
        } else {
            require(IERC20(bridgeAsset).transferFrom(msg.sender, address(this), bridgeAssets), "Transfer failed");
        }

        routes[routeId].bridgeReturnAssets = bridgeAmountOut;

        if (assetConverter != address(0) && bridgeAsset != asset) {
            require(IERC20(bridgeAsset).approve(assetConverter, 0), "Approve reset failed");
            require(IERC20(bridgeAsset).approve(assetConverter, bridgeAmountOut), "Approve failed");
            assetsOut = IAssetConverter(assetConverter).convertToVaultAsset(bridgeAmountOut, address(this), completionId);
        } else {
            assetsOut = bridgeAmountOut;
        }

        if (minReturnBps > 0 && bridgeAssets > 0) {
            require(assetsOut >= (bridgeAssets * minReturnBps) / BPS_DENOMINATOR, "Slippage too high");
        }

        require(IERC20(asset).transfer(vault, assetsOut), "Transfer failed");
    }

    uint256[40] private __gap;
}
