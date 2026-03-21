// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IReserveAllocator} from "./interfaces/IReserveAllocator.sol";
import {IWithdrawalQueue} from "./interfaces/IWithdrawalQueue.sol";
import {IWETHLike} from "./interfaces/IWETHLike.sol";

/// @title BaseCapitalVault
/// @notice ETH-denominated vault on Base that mints ERC20 shares and tracks
///         capital buckets across liquid, reserve, bridge, and HL strategy sleeves.
contract BaseCapitalVault is Initializable, ERC20Upgradeable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000;
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant VIRTUAL_ASSETS = 1e3;

    address public weth;
    address public allocator;
    address public navReporter;
    address public reserveAllocator;
    address public withdrawalQueue;

    bytes32 public trancheId;
    uint16 public performanceFeeBps;
    uint16 public reserveTargetBps;
    uint16 public liquidTargetBps;
    uint16 public hlTargetBps;

    uint256 public liquidAssetsStored;
    uint256 public reserveAssetsStored;
    uint256 public pendingBridgeAssetsStored;
    uint256 public hlStrategyAssetsStored;
    uint256 public accruedFeesEth;

    uint256 public lastNavTimestamp;
    bytes32 public lastNavHash;

    uint256 private reentrancyLock;

    event DepositETH(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event InstantRedeem(address indexed caller, address indexed receiver, uint256 shares, uint256 assetsOut);
    event WithdrawRequested(
        address indexed caller,
        address indexed receiver,
        uint256 indexed requestId,
        uint256 shares,
        uint256 assetsEstimate
    );
    event WithdrawFulfilled(uint256 indexed requestId, address indexed receiver, uint256 shares, uint256 assetsOut);
    event ReserveAllocatorUpdated(address indexed previousAllocator, address indexed nextAllocator);
    event WithdrawalQueueUpdated(address indexed previousQueue, address indexed nextQueue);
    event AllocatorUpdated(address indexed previousAllocator, address indexed nextAllocator);
    event NavReporterUpdated(address indexed previousReporter, address indexed nextReporter);
    event ReserveAllocated(uint256 assets);
    event ReserveDeallocated(uint256 requestedAssets, uint256 assetsReturned);
    event BridgeOutMarked(bytes32 indexed routeId, uint256 assets);
    event BridgeInMarked(bytes32 indexed routeId, uint256 assets);
    event StrategyIncreaseMarked(bytes32 indexed settlementId, uint256 assets);
    event StrategyDecreaseMarked(bytes32 indexed settlementId, uint256 assets);
    event DailyNavSettled(
        uint256 reserveAssetsEth,
        uint256 pendingBridgeEth,
        uint256 hlStrategyAssetsEth,
        uint256 feesEth,
        bytes32 navHash
    );

    modifier onlyAllocator() {
        require(msg.sender == allocator, "Not allocator");
        _;
    }

    modifier onlyNavReporter() {
        require(msg.sender == navReporter, "Not nav reporter");
        _;
    }

    modifier nonReentrant() {
        require(reentrancyLock == 1, "Reentrancy");
        reentrancyLock = 2;
        _;
        reentrancyLock = 1;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        address weth_,
        bytes32 trancheId_,
        uint16 performanceFeeBps_,
        uint16 reserveTargetBps_,
        uint16 liquidTargetBps_,
        uint16 hlTargetBps_
    ) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(weth_ != address(0), "Zero WETH");
        require(performanceFeeBps_ <= MAX_PERFORMANCE_FEE_BPS, "Fee too high");
        require(
            uint256(reserveTargetBps_) + uint256(liquidTargetBps_) + uint256(hlTargetBps_) == BPS_DENOMINATOR,
            "Bad targets"
        );

        __ERC20_init(name_, symbol_);
        __Ownable_init(owner_);
        __Pausable_init();

        weth = weth_;
        trancheId = trancheId_;
        performanceFeeBps = performanceFeeBps_;
        reserveTargetBps = reserveTargetBps_;
        liquidTargetBps = liquidTargetBps_;
        hlTargetBps = hlTargetBps_;
        reentrancyLock = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function totalAssets() public view returns (uint256) {
        uint256 gross = liquidAssetsStored + reserveAssetsStored + pendingBridgeAssetsStored + hlStrategyAssetsStored;
        if (gross <= accruedFeesEth) return 0;
        return gross - accruedFeesEth;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        if (assets == 0) return 0;
        return (assets * (totalSupply() + VIRTUAL_SHARES)) / (totalAssets() + VIRTUAL_ASSETS);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (shares == 0) return 0;
        return (shares * (totalAssets() + VIRTUAL_ASSETS)) / (totalSupply() + VIRTUAL_SHARES);
    }

    function sharePriceE18() public view returns (uint256) {
        return ((totalAssets() + VIRTUAL_ASSETS) * 1e18) / (totalSupply() + VIRTUAL_SHARES);
    }

    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return convertToAssets(shares);
    }

    function asset() external view returns (address) {
        return weth;
    }

    function depositETH(address receiver) external payable nonReentrant whenNotPaused returns (uint256 shares) {
        require(receiver != address(0), "Zero receiver");
        require(msg.value > 0, "Zero deposit");

        shares = convertToShares(msg.value);
        require(shares > 0, "Deposit too small");

        IWETHLike(weth).deposit{value: msg.value}();
        liquidAssetsStored += msg.value;
        _mint(receiver, shares);

        emit DepositETH(msg.sender, receiver, msg.value, shares);
    }

    function requestWithdraw(uint256 shares, address receiver) external nonReentrant whenNotPaused returns (uint256 requestId) {
        require(withdrawalQueue != address(0), "Queue not set");
        require(receiver != address(0), "Zero receiver");
        require(shares > 0, "Zero shares");

        uint256 assetsEstimate = previewRedeem(shares);
        _transfer(msg.sender, withdrawalQueue, shares);
        requestId = IWithdrawalQueue(withdrawalQueue).enqueue(msg.sender, receiver, shares, assetsEstimate);

        emit WithdrawRequested(msg.sender, receiver, requestId, shares, assetsEstimate);
    }

    function redeemInstant(uint256 shares, address receiver) external nonReentrant whenNotPaused returns (uint256 assetsOut) {
        require(receiver != address(0), "Zero receiver");
        require(shares > 0, "Zero shares");

        assetsOut = previewRedeem(shares);
        require(assetsOut > 0, "Redeem too small");
        require(assetsOut <= liquidAssetsStored, "Insufficient liquid assets");

        liquidAssetsStored -= assetsOut;
        _burn(msg.sender, shares);
        IWETHLike(weth).withdraw(assetsOut);
        _sendEth(receiver, assetsOut);

        emit InstantRedeem(msg.sender, receiver, shares, assetsOut);
    }

    function fulfillWithdrawalRequest(uint256 requestId) external nonReentrant whenNotPaused onlyAllocator {
        require(withdrawalQueue != address(0), "Queue not set");

        (
            ,
            address receiver,
            uint256 shares,
            ,
            ,
            ,
            bool finalized
        ) = IWithdrawalQueue(withdrawalQueue).getRequest(requestId);

        require(!finalized, "Already finalized");
        uint256 assetsOut = previewRedeem(shares);
        require(assetsOut > 0, "Zero assets");
        require(assetsOut <= liquidAssetsStored, "Insufficient liquid assets");

        liquidAssetsStored -= assetsOut;
        _burn(withdrawalQueue, shares);
        IWithdrawalQueue(withdrawalQueue).markFulfilled(requestId, assetsOut);

        IWETHLike(weth).withdraw(assetsOut);
        _sendEth(receiver, assetsOut);

        emit WithdrawFulfilled(requestId, receiver, shares, assetsOut);
    }

    function allocateToReserve(uint256 assets) external nonReentrant whenNotPaused onlyAllocator {
        require(reserveAllocator != address(0), "Reserve allocator not set");
        require(assets > 0, "Zero assets");
        require(assets <= liquidAssetsStored, "Insufficient liquid assets");

        liquidAssetsStored -= assets;
        require(IERC20(weth).approve(reserveAllocator, 0), "Approve reset failed");
        require(IERC20(weth).approve(reserveAllocator, assets), "Approve failed");
        IReserveAllocator(reserveAllocator).deposit(assets);
        reserveAssetsStored += assets;

        emit ReserveAllocated(assets);
    }

    function deallocateFromReserve(uint256 assets) external nonReentrant whenNotPaused onlyAllocator returns (uint256 assetsOut) {
        require(reserveAllocator != address(0), "Reserve allocator not set");
        require(assets > 0, "Zero assets");

        assetsOut = IReserveAllocator(reserveAllocator).withdraw(assets, address(this));
        liquidAssetsStored += assetsOut;
        if (assetsOut >= reserveAssetsStored) {
            reserveAssetsStored = 0;
        } else {
            reserveAssetsStored -= assetsOut;
        }

        emit ReserveDeallocated(assets, assetsOut);
    }

    function markBridgeOut(uint256 assets, bytes32 routeId) external onlyAllocator {
        require(assets > 0, "Zero assets");
        require(assets <= liquidAssetsStored, "Insufficient liquid assets");
        liquidAssetsStored -= assets;
        pendingBridgeAssetsStored += assets;
        emit BridgeOutMarked(routeId, assets);
    }

    function markBridgeIn(uint256 assets, bytes32 routeId) external onlyAllocator {
        require(assets > 0, "Zero assets");
        require(assets <= pendingBridgeAssetsStored, "Bridge underflow");
        pendingBridgeAssetsStored -= assets;
        liquidAssetsStored += assets;
        emit BridgeInMarked(routeId, assets);
    }

    function markStrategyIncrease(uint256 assets, bytes32 settlementId) external onlyAllocator {
        require(assets > 0, "Zero assets");
        require(assets <= pendingBridgeAssetsStored, "Strategy underflow");
        pendingBridgeAssetsStored -= assets;
        hlStrategyAssetsStored += assets;
        emit StrategyIncreaseMarked(settlementId, assets);
    }

    function markStrategyDecrease(uint256 assets, bytes32 settlementId) external onlyAllocator {
        require(assets > 0, "Zero assets");
        require(assets <= hlStrategyAssetsStored, "Strategy underflow");
        hlStrategyAssetsStored -= assets;
        liquidAssetsStored += assets;
        emit StrategyDecreaseMarked(settlementId, assets);
    }

    function settleDailyNav(
        uint256 strategyAssetsEth,
        uint256 reserveAssetsEth,
        uint256 pendingBridgeEth,
        uint256 feesEth,
        bytes32 navHash
    ) external onlyNavReporter {
        hlStrategyAssetsStored = strategyAssetsEth;
        reserveAssetsStored = reserveAssetsEth;
        pendingBridgeAssetsStored = pendingBridgeEth;
        accruedFeesEth = feesEth;
        lastNavTimestamp = block.timestamp;
        lastNavHash = navHash;

        emit DailyNavSettled(reserveAssetsEth, pendingBridgeEth, strategyAssetsEth, feesEth, navHash);
    }

    function setAllocator(address nextAllocator) external onlyOwner {
        emit AllocatorUpdated(allocator, nextAllocator);
        allocator = nextAllocator;
    }

    function setNavReporter(address nextReporter) external onlyOwner {
        emit NavReporterUpdated(navReporter, nextReporter);
        navReporter = nextReporter;
    }

    function setReserveAllocator(address nextAllocator) external onlyOwner {
        emit ReserveAllocatorUpdated(reserveAllocator, nextAllocator);
        reserveAllocator = nextAllocator;
    }

    function setWithdrawalQueue(address nextQueue) external onlyOwner {
        emit WithdrawalQueueUpdated(withdrawalQueue, nextQueue);
        withdrawalQueue = nextQueue;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _sendEth(address receiver, uint256 amount) internal {
        (bool ok, ) = payable(receiver).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
