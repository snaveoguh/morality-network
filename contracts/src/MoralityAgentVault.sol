// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MoralityAgentVault
/// @notice Shared ETH vault for funding autonomous trading agents.
///         Depositors receive vault shares and can withdraw against available liquidity.
///         Manager can allocate capital to an external strategy wallet and settle returns.
/// @dev Performance fee is charged only on realized positive strategy PnL when capital is returned.
contract MoralityAgentVault {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20%

    address public owner;
    address public manager;
    address public feeRecipient;
    uint256 public performanceFeeBps;

    uint256 public totalShares;
    uint256 public deployedCapital;
    uint256 public cumulativeStrategyProfit;
    uint256 public cumulativeStrategyLoss;
    uint256 public totalFeesPaid;

    mapping(address => uint256) public shareBalance;
    mapping(address => uint256) public cumulativeDeposits;
    mapping(address => uint256) public cumulativeWithdrawals;

    mapping(address => bool) private isKnownFunder;
    address[] private funders;

    uint256 private reentrancyLock = 1;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
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

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

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

    constructor(address _manager, address _feeRecipient, uint256 _performanceFeeBps) {
        require(_manager != address(0), "Zero manager");
        require(_feeRecipient != address(0), "Zero fee recipient");
        require(_performanceFeeBps <= MAX_PERFORMANCE_FEE_BPS, "Fee too high");

        owner = msg.sender;
        manager = _manager;
        feeRecipient = _feeRecipient;
        performanceFeeBps = _performanceFeeBps;

        emit OwnershipTransferred(address(0), msg.sender);
        emit ManagerUpdated(address(0), _manager);
        emit FeeRecipientUpdated(address(0), _feeRecipient);
        emit PerformanceFeeUpdated(0, _performanceFeeBps);
    }

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
    function sharePriceE18() public view returns (uint256) {
        if (totalShares == 0) return 1e18;
        uint256 managed = totalManagedAssets();
        if (managed == 0) return 1e18;
        return (managed * 1e18) / totalShares;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        if (assets == 0) return 0;
        uint256 managed = totalManagedAssets();
        if (totalShares == 0 || managed == 0) return assets;
        return (assets * totalShares) / managed;
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (shares == 0) return 0;
        uint256 managed = totalManagedAssets();
        if (totalShares == 0 || managed == 0) return shares;
        return (shares * managed) / totalShares;
    }

    function maxWithdraw(address funder) public view returns (uint256) {
        uint256 equityAssets = convertToAssets(shareBalance[funder]);
        uint256 liquid = address(this).balance;
        return equityAssets < liquid ? equityAssets : liquid;
    }

    function maxRedeem(address funder) public view returns (uint256) {
        uint256 holderShares = shareBalance[funder];
        if (holderShares == 0 || totalShares == 0) return 0;

        uint256 managed = totalManagedAssets();
        if (managed == 0) return 0;

        uint256 liquidShares = (address(this).balance * totalShares) / managed;
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

    function deposit() external payable nonReentrant returns (uint256 sharesMinted) {
        require(msg.value > 0, "Zero deposit");

        uint256 managedBefore = totalManagedAssets() - msg.value;
        if (totalShares == 0 || managedBefore == 0) {
            sharesMinted = msg.value;
        } else {
            sharesMinted = (msg.value * totalShares) / managedBefore;
        }
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
        uint256 managed = totalManagedAssets();
        if (totalShares == 0 || managed == 0) return assets;
        sharesNeeded = _ceilDiv(assets * totalShares, managed);
    }

    // =========================================================================
    // MANAGER OPERATIONS
    // =========================================================================

    /// @notice Move vault ETH into a strategy wallet (e.g. autonomous agent wallet).
    function allocateToStrategy(address payable to, uint256 amount) external onlyManager nonReentrant {
        require(to != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");
        require(amount <= address(this).balance, "Insufficient liquid assets");

        deployedCapital += amount;

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

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
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
}
