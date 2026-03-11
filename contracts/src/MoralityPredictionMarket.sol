// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MoralityPredictionMarket
/// @notice Prediction markets on DAO proposal outcomes.
///         Oracle = Ethereum blockchain (the actual onchain vote result).
///         Stake ETH on FOR or AGAINST — winners split the pot proportionally.
///         Market starts at 50/50 implied odds. Real odds shift with stake.
/// @dev Uses a parimutuel pool model: total pot is split among winners
///      proportional to their stake. No AMM/orderbook needed.

/// @notice Governor-like interface (Governor Bravo/DAOs with `state(uint256)`).
interface IProposalState {
    function state(uint256 proposalId) external view returns (uint8);
}

contract MoralityPredictionMarket {
    enum Outcome { UNRESOLVED, FOR, AGAINST, VOID }

    struct DaoResolverConfig {
        address governor;
        bool enabled;
    }

    struct Market {
        bytes32 proposalKey;       // keccak256(dao:proposalId)
        uint256 forPool;           // total ETH staked on FOR
        uint256 againstPool;       // total ETH staked on AGAINST
        uint256 forStakers;        // count of unique FOR stakers
        uint256 againstStakers;    // count of unique AGAINST stakers
        uint256 createdAt;
        uint256 resolvedAt;
        Outcome outcome;
        address governor;          // resolver locked at market creation
        uint256 proposalNumericId; // parsed proposal id locked at creation
        bool exists;
    }

    struct Position {
        uint256 forStake;
        uint256 againstStake;
        bool claimed;
    }

    address public owner;
    uint256 public protocolFeeBps = 200; // 2% fee on winnings
    uint256 public totalFeesCollected;

    // dao key hash => resolver config
    mapping(bytes32 => DaoResolverConfig) public daoResolverConfigs;

    // proposalKey => Market
    mapping(bytes32 => Market) public markets;
    // proposalKey => user => Position
    mapping(bytes32 => mapping(address => Position)) public positions;

    event MarketCreated(bytes32 indexed proposalKey, string dao, string proposalId);
    event StakePlaced(bytes32 indexed proposalKey, address indexed staker, bool isFor, uint256 amount);
    event MarketResolved(bytes32 indexed proposalKey, Outcome outcome);
    event MarketResolvedFromChain(bytes32 indexed proposalKey, uint8 chainState, Outcome outcome);
    event WinningsClaimed(bytes32 indexed proposalKey, address indexed staker, uint256 payout);
    event MarketVoided(bytes32 indexed proposalKey);
    event DaoResolverSet(string dao, address indexed governor, bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Governor state enum compatibility:
    // 0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed, 8=Vetoed
    // Nouns extensions may include 9=ObjectionPeriod, 10=Updatable.
    function _isStakeableState(uint8 chainState) internal pure returns (bool) {
        return chainState == 0 || chainState == 1 || chainState == 9 || chainState == 10;
    }

    // ========================================================================
    // MARKET CREATION
    // ========================================================================

    /// @notice Create a prediction market for a DAO proposal.
    ///         Anyone can create a market. First stake seeds it.
    function createMarket(
        string calldata dao,
        string calldata proposalId
    ) external {
        DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
        require(cfg.enabled && cfg.governor != address(0), "DAO not onchain-resolvable");

        uint256 proposalNumericId = _parseUintStrict(proposalId);
        uint8 chainState = _readGovernorState(cfg.governor, proposalNumericId);
        require(_isStakeableState(chainState), "Proposal not open");

        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        require(!markets[key].exists, "Market exists");

        markets[key] = Market({
            proposalKey: key,
            forPool: 0,
            againstPool: 0,
            forStakers: 0,
            againstStakers: 0,
            createdAt: block.timestamp,
            resolvedAt: 0,
            outcome: Outcome.UNRESOLVED,
            governor: cfg.governor,
            proposalNumericId: proposalNumericId,
            exists: true
        });

        emit MarketCreated(key, dao, proposalId);
    }

    // ========================================================================
    // STAKING
    // ========================================================================

    /// @notice Stake ETH on a prediction outcome
    /// @param dao The DAO identifier
    /// @param proposalId The proposal ID
    /// @param isFor true = stake on FOR (proposal passes), false = AGAINST
    function stake(
        string calldata dao,
        string calldata proposalId,
        bool isFor
    ) external payable {
        require(msg.value > 0, "Must stake ETH");

        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));

        // Auto-create market if it doesn't exist
        if (!markets[key].exists) {
            DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
            require(cfg.enabled && cfg.governor != address(0), "DAO not onchain-resolvable");
            uint256 proposalNumericId = _parseUintStrict(proposalId);
            uint8 chainState = _readGovernorState(cfg.governor, proposalNumericId);
            require(_isStakeableState(chainState), "Proposal not open");

            markets[key] = Market({
                proposalKey: key,
                forPool: 0,
                againstPool: 0,
                forStakers: 0,
                againstStakers: 0,
                createdAt: block.timestamp,
                resolvedAt: 0,
                outcome: Outcome.UNRESOLVED,
                governor: cfg.governor,
                proposalNumericId: proposalNumericId,
                exists: true
            });
            emit MarketCreated(key, dao, proposalId);
        }

        Market storage m = markets[key];
        require(m.outcome == Outcome.UNRESOLVED, "Market resolved");
        require(m.governor != address(0), "Market not resolvable");
        uint8 latestState = _readGovernorState(m.governor, m.proposalNumericId);
        require(_isStakeableState(latestState), "Proposal not open");

        Position storage pos = positions[key][msg.sender];

        if (isFor) {
            if (pos.forStake == 0) m.forStakers++;
            pos.forStake += msg.value;
            m.forPool += msg.value;
        } else {
            if (pos.againstStake == 0) m.againstStakers++;
            pos.againstStake += msg.value;
            m.againstPool += msg.value;
        }

        emit StakePlaced(key, msg.sender, isFor, msg.value);
    }

    // ========================================================================
    // RESOLUTION — Oracle is the actual DAO vote result
    // ========================================================================

    /// @notice Resolve a market from DAO governor state (fully onchain query).
    ///         Anyone can trigger once the proposal is in a terminal state.
    function resolve(
        string calldata dao,
        string calldata proposalId
    ) external {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        Market storage m = markets[key];
        require(m.exists, "No market");
        require(m.outcome == Outcome.UNRESOLVED, "Already resolved");

        // Legacy safety: if a market was created before resolver fields existed,
        // initialize from current dao resolver config once.
        if (m.governor == address(0)) {
            DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
            require(cfg.enabled && cfg.governor != address(0), "DAO not configured");
            m.governor = cfg.governor;
            m.proposalNumericId = _parseUintStrict(proposalId);
        }

        uint8 chainState = _readGovernorState(m.governor, m.proposalNumericId);
        Outcome outcome = _mapOutcome(chainState);

        m.outcome = outcome;
        m.resolvedAt = block.timestamp;

        if (outcome == Outcome.VOID) {
            emit MarketVoided(key);
        } else {
            emit MarketResolved(key, outcome);
        }
        emit MarketResolvedFromChain(key, chainState, outcome);
    }

    // ========================================================================
    // CLAIMING
    // ========================================================================

    /// @notice Claim winnings after market resolution.
    ///         Winners split the total pot proportional to their stake.
    ///         If VOID, everyone gets their stake back.
    function claim(
        string calldata dao,
        string calldata proposalId
    ) external {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        Market storage m = markets[key];
        require(m.exists, "No market");
        require(m.outcome != Outcome.UNRESOLVED, "Not resolved");

        Position storage pos = positions[key][msg.sender];
        require(!pos.claimed, "Already claimed");
        pos.claimed = true;

        uint256 payout = 0;

        if (m.outcome == Outcome.VOID) {
            // Refund all stakes
            payout = pos.forStake + pos.againstStake;
        } else {
            uint256 totalPot = m.forPool + m.againstPool;

            if (m.outcome == Outcome.FOR && pos.forStake > 0) {
                // Winner: proportional share of total pot
                payout = (pos.forStake * totalPot) / m.forPool;
            } else if (m.outcome == Outcome.AGAINST && pos.againstStake > 0) {
                payout = (pos.againstStake * totalPot) / m.againstPool;
            }
            // Losers get nothing (payout stays 0)

            // Protocol fee on profit only (not on returned stake)
            if (payout > 0) {
                uint256 winnerStake = m.outcome == Outcome.FOR ? pos.forStake : pos.againstStake;
                uint256 profit = payout > winnerStake ? payout - winnerStake : 0;
                uint256 fee = (profit * protocolFeeBps) / 10000;
                totalFeesCollected += fee;
                payout -= fee;
            }
        }

        require(payout > 0, "Nothing to claim");

        (bool ok, ) = payable(msg.sender).call{value: payout}("");
        require(ok, "Transfer failed");

        emit WinningsClaimed(key, msg.sender, payout);
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /// @notice Get market data with implied odds
    function getMarket(string calldata dao, string calldata proposalId)
        external view returns (
            uint256 forPool,
            uint256 againstPool,
            uint256 forStakers,
            uint256 againstStakers,
            uint256 forOddsBps,    // implied probability in bps (e.g. 5000 = 50%)
            uint256 againstOddsBps,
            uint8 outcome,
            bool exists
        )
    {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        Market memory m = markets[key];

        uint256 total = m.forPool + m.againstPool;
        // Start at 50/50 when empty, shift with stakes
        uint256 _forOdds = total == 0 ? 5000 : (m.forPool * 10000) / total;
        uint256 _againstOdds = total == 0 ? 5000 : (m.againstPool * 10000) / total;

        return (
            m.forPool,
            m.againstPool,
            m.forStakers,
            m.againstStakers,
            _forOdds,
            _againstOdds,
            uint8(m.outcome),
            m.exists
        );
    }

    /// @notice Get a user's position in a market
    function getPosition(string calldata dao, string calldata proposalId, address user)
        external view returns (uint256 forStake, uint256 againstStake, bool claimed)
    {
        bytes32 key = keccak256(abi.encodePacked(dao, ":", proposalId));
        Position memory pos = positions[key][user];
        return (pos.forStake, pos.againstStake, pos.claimed);
    }

    // ========================================================================
    // ADMIN
    // ========================================================================

    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high"); // max 10%
        protocolFeeBps = _feeBps;
    }

    /// @notice Configure a DAO to resolve from an onchain governor contract.
    /// @dev dao should match the UI key used in stake/create (e.g. "nouns", "lil-nouns").
    function setDaoResolver(string calldata dao, address governor, bool enabled) external onlyOwner {
        require(bytes(dao).length > 0, "DAO key required");
        if (enabled) {
            require(governor != address(0), "Governor required");
        }

        daoResolverConfigs[keccak256(bytes(dao))] = DaoResolverConfig({
            governor: governor,
            enabled: enabled
        });

        emit DaoResolverSet(dao, governor, enabled);
    }

    /// @notice Returns whether a DAO key is enabled for onchain resolution.
    function isDaoResolvable(string calldata dao) external view returns (bool) {
        return _isDaoResolvable(dao);
    }

    function _isDaoResolvable(string calldata dao) internal view returns (bool) {
        DaoResolverConfig memory cfg = daoResolverConfigs[keccak256(bytes(dao))];
        return cfg.enabled && cfg.governor != address(0);
    }

    function _mapOutcome(uint8 chainState) internal pure returns (Outcome outcome) {
        // Governor Bravo states:
        // 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed, 8=Vetoed
        if (chainState == 4 || chainState == 5 || chainState == 7) {
            return Outcome.FOR;
        }
        if (chainState == 3 || chainState == 8) {
            return Outcome.AGAINST;
        }
        if (chainState == 2 || chainState == 6) {
            return Outcome.VOID;
        }

        revert("Proposal not final");
    }

    function _readGovernorState(address governor, uint256 proposalNumericId) internal view returns (uint8 chainState) {
        try IProposalState(governor).state(proposalNumericId) returns (uint8 stateValue) {
            return stateValue;
        } catch {
            revert("Invalid proposal");
        }
    }

    function _parseUintStrict(string calldata input) internal pure returns (uint256 value) {
        bytes calldata b = bytes(input);
        require(b.length > 0, "Proposal ID required");

        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            require(c >= 48 && c <= 57, "Proposal ID must be numeric");
            value = (value * 10) + (c - 48);
        }
    }

    function withdrawFees() external onlyOwner {
        uint256 fees = totalFeesCollected;
        totalFeesCollected = 0;
        (bool ok, ) = payable(owner).call{value: fees}("");
        require(ok, "Withdraw failed");
    }

    receive() external payable {}
}
