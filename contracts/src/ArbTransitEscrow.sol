// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IArbTransitEscrow} from "./interfaces/IArbTransitEscrow.sol";

contract ArbTransitEscrow is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, IArbTransitEscrow {
    address public asset;
    address public bridgeExecutor;
    address public strategyManager;
    uint256 public totalEscrowed;

    mapping(bytes32 => uint256) public routeBalances;

    event BridgeExecutorUpdated(address indexed previousExecutor, address indexed nextExecutor);
    event StrategyManagerUpdated(address indexed previousManager, address indexed nextManager);
    event BridgeReceived(bytes32 indexed routeId, uint256 assets);
    event ReleasedToStrategy(bytes32 indexed routeId, address indexed receiver, uint256 assets);
    event ReceivedFromStrategy(bytes32 indexed routeId, uint256 assets);
    event ReleasedToBridge(bytes32 indexed routeId, address indexed receiver, uint256 assets);

    modifier onlyBridgeExecutor() {
        require(msg.sender == bridgeExecutor, "Not bridge executor");
        _;
    }

    modifier onlyStrategyManager() {
        require(msg.sender == strategyManager, "Not strategy manager");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address asset_, address bridgeExecutor_, address strategyManager_) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(asset_ != address(0), "Zero asset");
        require(bridgeExecutor_ != address(0), "Zero executor");
        require(strategyManager_ != address(0), "Zero manager");

        __Ownable_init(owner_);
        __Pausable_init();
        asset = asset_;
        bridgeExecutor = bridgeExecutor_;
        strategyManager = strategyManager_;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function receiveBridge(bytes32 routeId, uint256 assets) external onlyBridgeExecutor whenNotPaused {
        require(routeId != bytes32(0), "Zero route");
        require(assets > 0, "Zero assets");
        require(IERC20(asset).transferFrom(msg.sender, address(this), assets), "Transfer failed");
        routeBalances[routeId] += assets;
        totalEscrowed += assets;
        emit BridgeReceived(routeId, assets);
    }

    function releaseToStrategy(bytes32 routeId, uint256 assets, address receiver) external onlyStrategyManager whenNotPaused {
        require(receiver != address(0), "Zero receiver");
        require(assets > 0, "Zero assets");
        require(routeBalances[routeId] >= assets, "Insufficient route balance");
        routeBalances[routeId] -= assets;
        totalEscrowed -= assets;
        require(IERC20(asset).transfer(receiver, assets), "Transfer failed");
        emit ReleasedToStrategy(routeId, receiver, assets);
    }

    function receiveFromStrategy(bytes32 routeId, uint256 assets) external onlyStrategyManager whenNotPaused {
        require(routeId != bytes32(0), "Zero route");
        require(assets > 0, "Zero assets");
        require(IERC20(asset).transferFrom(msg.sender, address(this), assets), "Transfer failed");
        routeBalances[routeId] += assets;
        totalEscrowed += assets;
        emit ReceivedFromStrategy(routeId, assets);
    }

    function releaseToBridge(bytes32 routeId, uint256 assets, address receiver) external onlyBridgeExecutor whenNotPaused {
        require(receiver != address(0), "Zero receiver");
        require(assets > 0, "Zero assets");
        require(routeBalances[routeId] >= assets, "Insufficient route balance");
        routeBalances[routeId] -= assets;
        totalEscrowed -= assets;
        require(IERC20(asset).transfer(receiver, assets), "Transfer failed");
        emit ReleasedToBridge(routeId, receiver, assets);
    }

    function setBridgeExecutor(address nextExecutor) external onlyOwner {
        require(nextExecutor != address(0), "Zero executor");
        emit BridgeExecutorUpdated(bridgeExecutor, nextExecutor);
        bridgeExecutor = nextExecutor;
    }

    function setStrategyManager(address nextManager) external onlyOwner {
        require(nextManager != address(0), "Zero manager");
        emit StrategyManagerUpdated(strategyManager, nextManager);
        strategyManager = nextManager;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    uint256[40] private __gap;
}
