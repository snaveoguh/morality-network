// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title MoralityAgentVault
/// @notice Shared ETH vault for funding autonomous trading agents.
///         Depositors receive vault shares and can withdraw against available liquidity.
///         Manager can allocate capital to an external strategy wallet and settle returns.
/// @dev Performance fee is charged only on realized positive strategy PnL when capital is returned.
contract MoralityAgentVault is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20%

    /// @notice Virtual offset to prevent first-depositor inflation attack (ERC-4626 style).
    /// Adds 1e3 virtual shares and 1e3 virtual assets so rounding-based share
    /// manipulation requires donating 1000x more capital than the attacker gains.
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant VIRTUAL_ASSETS = 1e3;

    // ─── Storage layout (MUST match deployed order — DO NOT reorder) ────
    address public manager;              // slot 0
    address public feeRecipient;         // slot 1
    uint256 public performanceFeeBps;    // slot 2

    uint256 public totalShares;          // slot 3
    uint256 public deployedCapital;      // slot 4
    uint256 public cumulativeStrategyProfit; // slot 5
    uint256 public cumulativeStrategyLoss;   // slot 6
    uint256 public totalFeesPaid;        // slot 7

    mapping(address => uint256) public shareBalance;       // slot 8
    mapping(address => uint256) public cumulativeDeposits;  // slot 9
    mapping(address => uint256) public cumulativeWithdrawals; // slot 10

    mapping(address => bool) private isKnownFunder; // slot 11
    address[] private funders;                      // slot 12

    uint256 private reentrancyLock;      // slot 13

    /// @notice Maximum percentage of total managed assets that can be deployed (in BPS).
    /// Prevents manager from allocating 100% of vault to a strategy wallet (rug vector).
    /// Default: 5000 (50%). Owner can adjust via setMaxAllocationBps().
    /// @dev APPENDED after reentrancyLock to preserve storage layout compatibility.
    uint256 public maxAllocationBps;     // slot 14 (new — uses first __gap slot)

    event ManagerUpdated(address indexed previousManager, address indexed newManager);
    event FeeRecipientUpdated(address indexed previousFeeRecipient, address indexed newFeeRecipient);
    event PerformanceFeeUpdated(uint256 previousFeeBps, uint256 newFeeBps);

    event Deposited(address indexed funder, uint256 assets, uint256 sharesMinted, uint256 sharePriceE18);
    event Withdrawn(address indexed funder, uint256 assets, uint256 sharesBurned, uint256 sharePriceE18);

    event CapitalAllocated(address indexed manager, address indexed to, uint256 amount, uint256 deployedCapitalAfter);
    event StrategySettled(
        address indexed manager,
        uint256 amountReturned,
        uint256 principalReturned,
        uint256 profit,
        uint256 feePaid,
        uint256 deployedCapitalAfter
    );
    event StrategyLossReported(address indexed manager, uint256 amount, string reason, uint256 deployedCapitalAfter);

    modifier onlyManager() {
        require(msg.sender == manager, "Not manager");
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

    function initialize(address _manager, address _feeRecipient, uint256 _performanceFeeBps) public initializer {
        require(_manager != address(0), "Zero manager");
        require(_feeRecipient != address(0), "Zero fee recipient");
        require(_performanceFeeBps <= MAX_PERFORMANCE_FEE_BPS, "Fee too high");

        __Ownable_init(msg.sender);
        __Pausable_init();

        manager = _manager;
        feeRecipient = _feeRecipient;
        performanceFeeBps = _performanceFeeBps;
        maxAllocationBps = 5000; // 50% — conservative default
        reentrancyLock = 1;

        emit ManagerUpdated(address(0), _manager);
        emit FeeRecipientUpdated(address(0), _feeRecipient);
        emit PerformanceFeeUpdated(0, _performanceFeeBps);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // =========================================================================
    // VIEW
    // =========================================================================

    /// @notice Total vault AUM = liquid ETH + capital currently deployed by manager.
    function totalManagedAssets() public view returns (uint256) {
        return address(this).balance + deployedCapital;
    }

    function liquidAssets() public view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Share price scaled by 1e18.
    /// Uses virtual offset to prevent first-depositor inflation attack.
    function sharePriceE18() public view returns (uint256) {
        uint256 virtualTotalShares = totalShares + VIRTUAL_SHARES;
        uint256 virtualTotalAssets = totalManagedAssets() + VIRTUAL_ASSETS;
        return (virtualTotalAssets * 1e18) / virtualTotalShares;
    }

    /// @notice Convert assets to shares using virtual offset (prevents inflation attack).
    function convertToShares(uint256 assets) public view returns (uint256) {
        if (assets == 0) return 0;
        return (assets * (totalShares + VIRTUAL_SHARES)) / (totalManagedAssets() + VIRTUAL_ASSETS);
    }

    /// @notice Convert shares to assets using virtual offset (prevents inflation attack).
    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (shares == 0) return 0;
        return (shares * (totalManagedAssets() + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
    }

    function maxWithdraw(address funder) public view returns (uint256) {
        uint256 equityAssets = convertToAssets(shareBalance[funder]);
        uint256 liquid = address(this).balance;
        return equityAssets < liquid ? equityAssets : liquid;
    }

    function maxRedeem(address funder) public view returns (uint256) {
        uint256 holderShares = shareBalance[funder];
        if (holderShares == 0) return 0;

        uint256 virtualTotalShares = totalShares + VIRTUAL_SHARES;
        uint256 virtualTotalAssets = totalManagedAssets() + VIRTUAL_ASSETS;

        uint256 liquidShares = (address(this).balance * virtualTotalShares) / virtualTotalAssets;
        return holderShares < liquidShares ? holderShares : liquidShares;
    }

    function getFunderCount() external view returns (uint256) {
        return funders.length;
    }

    function getFunders(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = funders.length;
        if (offset >= total) return new address[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = funders[offset + i];
        }
        return result;
    }

    function getFunderSnapshot(address funder)
        external
        view
        returns (
            uint256 shares,
            uint256 equityAssets,
            uint256 deposited,
            uint256 withdrawn,
            int256 pnl,
            int256 pnlBps
        )
    {
        shares = shareBalance[funder];
        equityAssets = convertToAssets(shares);
        deposited = cumulativeDeposits[funder];
        withdrawn = cumulativeWithdrawals[funder];

        pnl = _toInt(equityAssets + withdrawn) - _toInt(deposited);
        pnlBps = deposited == 0 ? int256(0) : (pnl * int256(BPS_DENOMINATOR)) / _toInt(deposited);
    }

    function getVaultState()
        external
        view
        returns (
            uint256 totalManagedAssets_,
            uint256 liquidAssets_,
            uint256 deployedCapital_,
            uint256 totalShares_,
            uint256 sharePriceE18_,
            uint256 performanceFeeBps_,
            address manager_,
            address feeRecipient_,
            uint256 cumulativeStrategyProfit_,
            uint256 cumulativeStrategyLoss_,
            uint256 totalFeesPaid_,
            uint256 funderCount_
        )
    {
        totalManagedAssets_ = totalManagedAssets();
        liquidAssets_ = liquidAssets();
        deployedCapital_ = deployedCapital;
        totalShares_ = totalShares;
        sharePriceE18_ = sharePriceE18();
        performanceFeeBps_ = performanceFeeBps;
        manager_ = manager;
        feeRecipient_ = feeRecipient;
        cumulativeStrategyProfit_ = cumulativeStrategyProfit;
        cumulativeStrategyLoss_ = cumulativeStrategyLoss;
        totalFeesPaid_ = totalFeesPaid;
        funderCount_ = funders.length;
    }

    // =========================================================================
    // DEPOSITS / WITHDRAWALS
    // =========================================================================

    function deposit() external payable nonReentrant whenNotPaused returns (uint256 sharesMinted) {
        require(msg.value > 0, "Zero deposit");

        // Use virtual offset to prevent first-depositor inflation attack.
        // managedBefore is the total assets BEFORE this deposit's ETH was added.
        uint256 managedBefore = totalManagedAssets() - msg.value;
        sharesMinted = (msg.value * (totalShares + VIRTUAL_SHARES)) / (managedBefore + VIRTUAL_ASSETS);
        require(sharesMinted > 0, "Deposit too small");

        totalShares += sharesMinted;
        shareBalance[msg.sender] += sharesMinted;
        cumulativeDeposits[msg.sender] += msg.value;

        if (!isKnownFunder[msg.sender]) {
            isKnownFunder[msg.sender] = true;
            funders.push(msg.sender);
        }

        emit Deposited(msg.sender, msg.value, sharesMinted, sharePriceE18());
    }

    function withdraw(uint256 assets) external nonReentrant returns (uint256 sharesBurned) {
        require(assets > 0, "Zero withdraw");
        require(assets <= address(this).balance, "Insufficient liquid assets");

        sharesBurned = previewWithdraw(assets);
        require(sharesBurned > 0, "Withdraw too small");
        require(shareBalance[msg.sender] >= sharesBurned, "Insufficient shares");

        shareBalance[msg.sender] -= sharesBurned;
        totalShares -= sharesBurned;
        cumulativeWithdrawals[msg.sender] += assets;

        (bool ok,) = payable(msg.sender).call{value: assets}("");
        require(ok, "Transfer failed");

        emit Withdrawn(msg.sender, assets, sharesBurned, sharePriceE18());
    }

    function redeem(uint256 shares) external nonReentrant returns (uint256 assetsOut) {
        require(shares > 0, "Zero redeem");
        require(shareBalance[msg.sender] >= shares, "Insufficient shares");

        assetsOut = convertToAssets(shares);
        require(assetsOut > 0, "Redeem too small");
        require(assetsOut <= address(this).balance, "Insufficient liquid assets");

        shareBalance[msg.sender] -= shares;
        totalShares -= shares;
        cumulativeWithdrawals[msg.sender] += assetsOut;

        (bool ok,) = payable(msg.sender).call{value: assetsOut}("");
        require(ok, "Transfer failed");

        emit Withdrawn(msg.sender, assetsOut, shares, sharePriceE18());
    }

    function previewWithdraw(uint256 assets) public view returns (uint256 sharesNeeded) {
        if (assets == 0) return 0;
        sharesNeeded = _ceilDiv(
            assets * (totalShares + VIRTUAL_SHARES),
            totalManagedAssets() + VIRTUAL_ASSETS
        );
    }

    // =========================================================================
    // MANAGER OPERATIONS
    // =========================================================================

    /// @notice Move vault ETH into a strategy wallet (e.g. autonomous agent wallet).
    /// Capped by maxAllocationBps to prevent manager from draining the vault.
    function allocateToStrategy(address payable to, uint256 amount) external onlyManager nonReentrant whenNotPaused {
        require(to != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");
        require(amount <= address(this).balance, "Insufficient liquid assets");

        // Enforce allocation cap: deployed capital after this allocation must not
        // exceed maxAllocationBps of total managed assets.
        uint256 newDeployed = deployedCapital + amount;
        uint256 totalAfter = totalManagedAssets(); // already includes current balance
        require(
            newDeployed * BPS_DENOMINATOR <= totalAfter * maxAllocationBps,
            "Exceeds max allocation"
        );

        deployedCapital = newDeployed;

        (bool ok,) = to.call{value: amount}("");
        require(ok, "Transfer failed");

        emit CapitalAllocated(msg.sender, to, amount, deployedCapital);
    }

    /// @notice Return strategy capital/profit back into vault and auto-pay performance fee on profit only.
    function returnFromStrategy() external payable onlyManager nonReentrant {
        require(msg.value > 0, "Zero return");

        uint256 principalReturned = msg.value;
        if (principalReturned > deployedCapital) {
            principalReturned = deployedCapital;
        }
        uint256 profit = msg.value - principalReturned;

        if (principalReturned > 0) {
            deployedCapital -= principalReturned;
        }

        uint256 fee = 0;
        if (profit > 0) {
            cumulativeStrategyProfit += profit;
            if (performanceFeeBps > 0) {
                fee = (profit * performanceFeeBps) / BPS_DENOMINATOR;
                if (fee > 0) {
                    totalFeesPaid += fee;
                    (bool ok,) = payable(feeRecipient).call{value: fee}("");
                    require(ok, "Fee transfer failed");
                }
            }
        }

        emit StrategySettled(msg.sender, msg.value, principalReturned, profit, fee, deployedCapital);
    }

    /// @notice Realize loss for strategy capital that cannot be returned.
    function reportStrategyLoss(uint256 amount, string calldata reason) external onlyManager {
        require(amount > 0, "Zero loss");
        require(amount <= deployedCapital, "Loss exceeds deployed");

        deployedCapital -= amount;
        cumulativeStrategyLoss += amount;

        emit StrategyLossReported(msg.sender, amount, reason, deployedCapital);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function setManager(address newManager) external onlyOwner {
        require(newManager != address(0), "Zero manager");
        emit ManagerUpdated(manager, newManager);
        manager = newManager;
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "Zero fee recipient");
        emit FeeRecipientUpdated(feeRecipient, newFeeRecipient);
        feeRecipient = newFeeRecipient;
    }

    function setPerformanceFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_PERFORMANCE_FEE_BPS, "Fee too high");
        emit PerformanceFeeUpdated(performanceFeeBps, newFeeBps);
        performanceFeeBps = newFeeBps;
    }

    /// @notice Set max allocation percentage (in BPS). 5000 = 50%, 10000 = 100%.
    function setMaxAllocationBps(uint256 newMaxBps) external onlyOwner {
        require(newMaxBps <= BPS_DENOMINATOR, "Max 100%");
        maxAllocationBps = newMaxBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        if (a == 0) return 0;
        return ((a - 1) / b) + 1;
    }

    function _toInt(uint256 value) private pure returns (int256) {
        require(value <= uint256(type(int256).max), "Int overflow");
        return int256(value);
    }

    uint256[49] private __gap; // was 50, now 49 after adding maxAllocationBps
}
