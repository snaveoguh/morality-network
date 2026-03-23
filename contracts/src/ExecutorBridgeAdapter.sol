// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IBridgeAdapter} from "./interfaces/IBridgeAdapter.sol";

contract ExecutorBridgeAdapter is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IBridgeAdapter {
    struct RouteTransfer {
        uint256 outboundAssets;
        uint256 inboundAssets;
        uint64 updatedAt;
        bool outboundComplete;
        bool inboundComplete;
        bytes32 lastRef;
    }

    address public bridgeAsset;
    address public router;
    address public bridgeExecutor;

    mapping(bytes32 => RouteTransfer) private routes;

    event RouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event BridgeExecutorUpdated(address indexed previousExecutor, address indexed nextExecutor);
    event BridgedOut(bytes32 indexed routeId, uint256 assets, address indexed receiver, bytes32 transferId, bytes32 bridgeRef);
    event InboundCompleted(bytes32 indexed routeId, uint256 assets, address indexed receiver, bytes32 completionId);

    modifier onlyRouter() {
        require(msg.sender == router, "Not router");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address bridgeAsset_, address router_, address bridgeExecutor_) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(bridgeAsset_ != address(0), "Zero asset");
        require(router_ != address(0), "Zero router");
        require(bridgeExecutor_ != address(0), "Zero executor");

        __Ownable_init(owner_);
        __Pausable_init();

        bridgeAsset = bridgeAsset_;
        router = router_;
        bridgeExecutor = bridgeExecutor_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function bridgeOut(bytes32 routeId, uint256 amount, address receiver, bytes32 bridgeRef)
        external
        onlyRouter
        whenNotPaused
        returns (bytes32 transferId)
    {
        require(receiver != address(0), "Zero receiver");
        require(amount > 0, "Zero amount");
        require(IERC20(bridgeAsset).transferFrom(msg.sender, bridgeExecutor, amount), "Transfer failed");

        RouteTransfer storage route = routes[routeId];
        route.outboundAssets += amount;
        route.updatedAt = uint64(block.timestamp);
        route.outboundComplete = true;
        route.lastRef = bridgeRef;
        transferId = keccak256(abi.encodePacked(address(this), routeId, amount, bridgeRef, block.timestamp));

        emit BridgedOut(routeId, amount, receiver, transferId, bridgeRef);
    }

    function completeInbound(bytes32 routeId, uint256 amount, address receiver, bytes32 completionId)
        external
        onlyRouter
        whenNotPaused
        returns (uint256 assetsOut)
    {
        require(receiver != address(0), "Zero receiver");
        require(amount > 0, "Zero amount");
        require(!routes[routeId].inboundComplete, "Already completed inbound");
        require(IERC20(bridgeAsset).transferFrom(bridgeExecutor, receiver, amount), "Transfer failed");

        RouteTransfer storage route = routes[routeId];
        route.inboundAssets += amount;
        route.updatedAt = uint64(block.timestamp);
        route.inboundComplete = true;
        route.lastRef = completionId;
        assetsOut = amount;

        emit InboundCompleted(routeId, assetsOut, receiver, completionId);
    }

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
        )
    {
        RouteTransfer storage route = routes[routeId];
        return (
            route.outboundAssets,
            route.inboundAssets,
            route.updatedAt,
            route.outboundComplete,
            route.inboundComplete,
            route.lastRef
        );
    }

    function setRouter(address nextRouter) external onlyOwner {
        require(nextRouter != address(0), "Zero router");
        emit RouterUpdated(router, nextRouter);
        router = nextRouter;
    }

    function setBridgeExecutor(address nextExecutor) external onlyOwner {
        require(nextExecutor != address(0), "Zero executor");
        emit BridgeExecutorUpdated(bridgeExecutor, nextExecutor);
        bridgeExecutor = nextExecutor;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[40] private __gap;
}
