// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {IBaseCapitalVault} from "./interfaces/IBaseCapitalVault.sol";
import {IBridgeRouter} from "./interfaces/IBridgeRouter.sol";
import {IReserveAllocator} from "./interfaces/IReserveAllocator.sol";

contract NavReporter is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public vault;
    address public reserveAllocator;
    address public bridgeRouter;
    address public reporter;
    uint64 public minReportInterval;
    uint256 public lastReportTimestamp;
    bytes32 public lastReportHash;

    uint256 public lastStrategyAssetsEth;
    uint256 public lastFeesEth;
    uint16 public maxStrategyDeltaBps;
    uint16 public maxFeeDeltaBps;

    event ReporterUpdated(address indexed previousReporter, address indexed nextReporter);
    event ReserveAllocatorUpdated(address indexed previousAllocator, address indexed nextAllocator);
    event BridgeRouterUpdated(address indexed previousRouter, address indexed nextRouter);
    event MinReportIntervalUpdated(uint64 previousInterval, uint64 nextInterval);
    event NavReported(
        uint256 strategyAssetsEth,
        uint256 reserveAssetsEth,
        uint256 pendingBridgeEth,
        uint256 feesEth,
        bytes32 indexed navHash
    );

    modifier onlyReporter() {
        require(msg.sender == reporter, "Not reporter");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address owner_,
        address vault_,
        address reserveAllocator_,
        address bridgeRouter_,
        address reporter_,
        uint64 minReportInterval_
    ) public initializer {
        require(owner_ != address(0), "Zero owner");
        require(vault_ != address(0), "Zero vault");
        require(reporter_ != address(0), "Zero reporter");

        __Ownable_init(owner_);
        __Pausable_init();
        vault = vault_;
        reserveAllocator = reserveAllocator_;
        bridgeRouter = bridgeRouter_;
        reporter = reporter_;
        minReportInterval = minReportInterval_;
        maxStrategyDeltaBps = 1_000; // 10% default
        maxFeeDeltaBps = 1_000; // 10% default
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation.code.length > 0, "Not a contract");
    }

    function reportNav(uint256 strategyAssetsEth, uint256 feesEth, bytes32 navHash) external onlyReporter whenNotPaused {
        if (minReportInterval > 0 && lastReportTimestamp != 0) {
            require(block.timestamp >= lastReportTimestamp + minReportInterval, "Report too soon");
        }

        if (lastReportTimestamp > 0) {
            _checkDelta(lastStrategyAssetsEth, strategyAssetsEth, maxStrategyDeltaBps, "Strategy delta too large");
            _checkDelta(lastFeesEth, feesEth, maxFeeDeltaBps, "Fee delta too large");
        }

        uint256 reserveAssetsEth = reserveAllocator == address(0)
            ? 0
            : IReserveAllocator(reserveAllocator).totalManagedAssets();
        uint256 pendingBridgeEth = bridgeRouter == address(0) ? 0 : IBridgeRouter(bridgeRouter).totalPendingAssets();

        IBaseCapitalVault(vault).settleDailyNav(strategyAssetsEth, reserveAssetsEth, pendingBridgeEth, feesEth, navHash);

        lastStrategyAssetsEth = strategyAssetsEth;
        lastFeesEth = feesEth;
        lastReportTimestamp = block.timestamp;
        lastReportHash = navHash;

        emit NavReported(strategyAssetsEth, reserveAssetsEth, pendingBridgeEth, feesEth, navHash);
    }

    function setReporter(address nextReporter) external onlyOwner {
        require(nextReporter != address(0), "Zero reporter");
        emit ReporterUpdated(reporter, nextReporter);
        reporter = nextReporter;
    }

    function setReserveAllocator(address nextAllocator) external onlyOwner {
        emit ReserveAllocatorUpdated(reserveAllocator, nextAllocator);
        reserveAllocator = nextAllocator;
    }

    function setBridgeRouter(address nextRouter) external onlyOwner {
        emit BridgeRouterUpdated(bridgeRouter, nextRouter);
        bridgeRouter = nextRouter;
    }

    function setMinReportInterval(uint64 nextInterval) external onlyOwner {
        emit MinReportIntervalUpdated(minReportInterval, nextInterval);
        minReportInterval = nextInterval;
    }

    function setMaxStrategyDeltaBps(uint16 nextDelta) external onlyOwner {
        require(nextDelta <= 5_000, "Delta too high");
        maxStrategyDeltaBps = nextDelta;
    }

    function setMaxFeeDeltaBps(uint16 nextDelta) external onlyOwner {
        require(nextDelta <= 5_000, "Delta too high");
        maxFeeDeltaBps = nextDelta;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _checkDelta(uint256 oldValue, uint256 newValue, uint16 maxDeltaBps, string memory errMsg) internal pure {
        if (maxDeltaBps == 0) return;
        if (oldValue == 0 && newValue == 0) return;
        uint256 basis = oldValue > newValue ? oldValue : newValue;
        if (basis == 0) basis = 1;
        uint256 delta = oldValue > newValue ? oldValue - newValue : newValue - oldValue;
        require(delta <= (basis * maxDeltaBps) / BPS_DENOMINATOR, errMsg);
    }

    uint256[40] private __gap;
}
