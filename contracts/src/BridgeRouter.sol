// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IBaseCapitalVault} from "./interfaces/IBaseCapitalVault.sol";
import {IBridgeRouter} from "./interfaces/IBridgeRouter.sol";

contract BridgeRouter is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IBridgeRouter {
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
        uint256 returnAssets;
        uint64 createdAt;
        uint64 updatedAt;
        bytes32 intentId;
        RouteStatus status;
    }

    address public vault;
    address public asset;
    address public operator;
    address public bridgeExecutor;
    address public arbEscrow;
    uint256 public totalPendingAssets;
    uint256 public nextRouteNonce;

    mapping(bytes32 => Route) private routes;

    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event BridgeExecutorUpdated(address indexed previousExecutor, address indexed nextExecutor);
    event ArbEscrowUpdated(address indexed previousEscrow, address indexed nextEscrow);
    event RouteCreated(bytes32 indexed routeId, bytes32 indexed intentId, uint256 assets);
    event RouteReceivedOnArb(bytes32 indexed routeId);
    event RouteDeployedToHl(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 assets);
    event RouteReturnPending(bytes32 indexed routeId, bytes32 indexed settlementId, uint256 assets);
    event RouteReturned(bytes32 indexed routeId, bytes32 indexed completionId, uint256 assets);
    event RouteFailed(bytes32 indexed routeId, bytes32 indexed completionId, uint256 assets);

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
        operator = operator_;
        bridgeExecutor = bridgeExecutor_;
        arbEscrow = arbEscrow_;
        nextRouteNonce = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function bridgeToArbitrum(uint256 assets, bytes32 intentId) external onlyOperator whenNotPaused returns (bytes32 routeId) {
        require(assets > 0, "Zero assets");

        uint256 nonce = nextRouteNonce++;
        routeId = keccak256(abi.encodePacked(address(this), block.chainid, nonce, intentId));
        require(routes[routeId].status == RouteStatus.None, "Route exists");

        routes[routeId] = Route({
            outboundAssets: assets,
            returnAssets: 0,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            intentId: intentId,
            status: RouteStatus.Pending
        });

        IBaseCapitalVault(vault).bridgeOutToRouter(assets, routeId, address(this));
        require(IERC20(asset).transfer(bridgeExecutor, assets), "Transfer failed");
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

        emit RouteDeployedToHl(routeId, settlementId, route.outboundAssets);
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

    function finalizeReturnToBase(bytes32 routeId, bytes32 completionId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.ReturnPending, "Bad route state");
        require(route.returnAssets > 0, "No return assets");

        uint256 assets = route.returnAssets;
        require(IERC20(asset).transferFrom(msg.sender, vault, assets), "Transfer failed");

        route.status = RouteStatus.Returned;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets -= assets;
        IBaseCapitalVault(vault).markBridgeReturned(assets, completionId);

        emit RouteReturned(routeId, completionId, assets);
    }

    function markFailedRoute(bytes32 routeId, bytes32 completionId) external onlyBridgeExecutor whenNotPaused {
        Route storage route = routes[routeId];
        require(route.status == RouteStatus.Pending || route.status == RouteStatus.ReceivedOnArb, "Bad route state");

        uint256 assets = route.outboundAssets;
        require(IERC20(asset).transferFrom(msg.sender, vault, assets), "Transfer failed");

        route.status = RouteStatus.Failed;
        route.updatedAt = uint64(block.timestamp);
        totalPendingAssets -= assets;
        IBaseCapitalVault(vault).markBridgeReturned(assets, completionId);

        emit RouteFailed(routeId, completionId, assets);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
