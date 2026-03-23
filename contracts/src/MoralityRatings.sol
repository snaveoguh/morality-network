// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoralityRegistry.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityRatings is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    struct Rating {
        address rater;
        uint8 score; // 1-5
        uint256 timestamp;
    }

    struct RatingReason {
        string reason;
        uint256 timestamp;
        bool exists;
    }

    struct EntityRatingStats {
        uint256 totalScore;
        uint256 ratingCount;
        uint256 lastUpdated;
    }

    struct InterpretationRating {
        uint8 truth;
        uint8 importance;
        uint8 moralImpact;
        uint256 timestamp;
        bool exists;
    }

    struct InterpretationStats {
        uint256 totalTruth;
        uint256 totalImportance;
        uint256 totalMoralImpact;
        uint256 ratingCount;
        uint256 lastUpdated;
    }

    MoralityRegistry public registry;

    // entityHash => rater => Rating
    mapping(bytes32 => mapping(address => Rating)) public userRatings;
    // entityHash => all rater addresses
    mapping(bytes32 => address[]) public entityRaters;
    // entityHash => stats
    mapping(bytes32 => EntityRatingStats) public entityStats;
    // Track if user has rated (to avoid duplicate entries in raters array)
    mapping(bytes32 => mapping(address => bool)) public hasRated;
    // entityHash => rater => reason metadata
    mapping(bytes32 => mapping(address => RatingReason)) public ratingReasons;
    // entityHash => rater => multidimensional interpretation
    mapping(bytes32 => mapping(address => InterpretationRating)) public interpretationRatings;
    // entityHash => aggregated multidimensional stats
    mapping(bytes32 => InterpretationStats) public interpretationStats;

    uint256 public constant MAX_REASON_LENGTH = 500;

    event Rated(bytes32 indexed entityHash, address indexed rater, uint8 score);
    event RatingUpdated(bytes32 indexed entityHash, address indexed rater, uint8 oldScore, uint8 newScore);
    event RatedWithReason(bytes32 indexed entityHash, address indexed rater, uint8 score, string reason);
    event RatingWithReasonUpdated(
        bytes32 indexed entityHash, address indexed rater, uint8 oldScore, uint8 newScore, string reason
    );
    event InterpretationRated(
        bytes32 indexed entityHash,
        address indexed rater,
        uint8 truth,
        uint8 importance,
        uint8 moralImpact,
        string reason
    );
    event InterpretationRatingUpdated(
        bytes32 indexed entityHash,
        address indexed rater,
        uint8 oldTruth,
        uint8 oldImportance,
        uint8 oldMoralImpact,
        uint8 newTruth,
        uint8 newImportance,
        uint8 newMoralImpact,
        string reason
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = MoralityRegistry(_registry);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function rate(bytes32 entityHash, uint8 score) external {
        _rate(entityHash, score);
    }

    function rateWithReason(bytes32 entityHash, uint8 score, string calldata reason) external {
        bytes memory reasonBytes = bytes(reason);
        require(reasonBytes.length > 0, "Reason required");
        require(reasonBytes.length <= MAX_REASON_LENGTH, "Reason too long");

        (bool updated, uint8 oldScore) = _rate(entityHash, score);

        ratingReasons[entityHash][msg.sender] = RatingReason({reason: reason, timestamp: block.timestamp, exists: true});

        if (updated) {
            emit RatingWithReasonUpdated(entityHash, msg.sender, oldScore, score, reason);
        } else {
            emit RatedWithReason(entityHash, msg.sender, score, reason);
        }
    }

    function _rate(bytes32 entityHash, uint8 score) internal returns (bool updated, uint8 oldScore) {
        require(score >= 1 && score <= 5, "Score must be 1-5");

        if (hasRated[entityHash][msg.sender]) {
            oldScore = userRatings[entityHash][msg.sender].score;
            entityStats[entityHash].totalScore = entityStats[entityHash].totalScore - oldScore + score;
            userRatings[entityHash][msg.sender].score = score;
            userRatings[entityHash][msg.sender].timestamp = block.timestamp;
            entityStats[entityHash].lastUpdated = block.timestamp;
            emit RatingUpdated(entityHash, msg.sender, oldScore, score);
            updated = true;
        } else {
            userRatings[entityHash][msg.sender] = Rating({
                rater: msg.sender,
                score: score,
                timestamp: block.timestamp
            });
            entityRaters[entityHash].push(msg.sender);
            hasRated[entityHash][msg.sender] = true;

            entityStats[entityHash].totalScore += score;
            entityStats[entityHash].ratingCount += 1;
            entityStats[entityHash].lastUpdated = block.timestamp;
            emit Rated(entityHash, msg.sender, score);
        }
    }

    /// @notice Rate interpretation dimensions on a 0-100 scale.
    function rateInterpretation(
        bytes32 entityHash,
        uint8 truth,
        uint8 importance,
        uint8 moralImpact,
        string calldata reason
    ) external {
        require(truth <= 100 && importance <= 100 && moralImpact <= 100, "Dimensions must be 0-100");
        require(bytes(reason).length <= MAX_REASON_LENGTH, "Reason too long");

        InterpretationStats storage stats = interpretationStats[entityHash];
        InterpretationRating storage existing = interpretationRatings[entityHash][msg.sender];

        if (existing.exists) {
            uint8 oldTruth = existing.truth;
            uint8 oldImportance = existing.importance;
            uint8 oldMoralImpact = existing.moralImpact;

            stats.totalTruth = stats.totalTruth - oldTruth + truth;
            stats.totalImportance = stats.totalImportance - oldImportance + importance;
            stats.totalMoralImpact = stats.totalMoralImpact - oldMoralImpact + moralImpact;
            stats.lastUpdated = block.timestamp;

            existing.truth = truth;
            existing.importance = importance;
            existing.moralImpact = moralImpact;
            existing.timestamp = block.timestamp;

            if (bytes(reason).length > 0) {
                ratingReasons[entityHash][msg.sender] =
                    RatingReason({reason: reason, timestamp: block.timestamp, exists: true});
            }

            emit InterpretationRatingUpdated(
                entityHash,
                msg.sender,
                oldTruth,
                oldImportance,
                oldMoralImpact,
                truth,
                importance,
                moralImpact,
                reason
            );
            return;
        }

        interpretationRatings[entityHash][msg.sender] = InterpretationRating({
            truth: truth,
            importance: importance,
            moralImpact: moralImpact,
            timestamp: block.timestamp,
            exists: true
        });

        stats.totalTruth += truth;
        stats.totalImportance += importance;
        stats.totalMoralImpact += moralImpact;
        stats.ratingCount += 1;
        stats.lastUpdated = block.timestamp;

        if (bytes(reason).length > 0) {
            ratingReasons[entityHash][msg.sender] = RatingReason({reason: reason, timestamp: block.timestamp, exists: true});
        }

        emit InterpretationRated(entityHash, msg.sender, truth, importance, moralImpact, reason);
    }

    function getAverageRating(bytes32 entityHash) external view returns (uint256 avg, uint256 count) {
        EntityRatingStats memory stats = entityStats[entityHash];
        if (stats.ratingCount == 0) return (0, 0);
        avg = (stats.totalScore * 100) / stats.ratingCount;
        count = stats.ratingCount;
    }

    function getUserRating(bytes32 entityHash, address user) external view returns (uint8 score, uint256 timestamp) {
        Rating memory r = userRatings[entityHash][user];
        return (r.score, r.timestamp);
    }

    function getRatingReason(bytes32 entityHash, address user)
        external
        view
        returns (string memory reason, uint256 timestamp, bool exists)
    {
        RatingReason storage r = ratingReasons[entityHash][user];
        return (r.reason, r.timestamp, r.exists);
    }

    function getRaters(bytes32 entityHash, uint256 offset, uint256 limit) external view returns (address[] memory) {
        address[] storage allRaters = entityRaters[entityHash];
        uint256 total = allRaters.length;

        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size;) {
            result[i] = allRaters[offset + i];
            unchecked { ++i; }
        }
        return result;
    }

    function getAverageInterpretation(bytes32 entityHash)
        external
        view
        returns (uint256 avgTruth, uint256 avgImportance, uint256 avgMoralImpact, uint256 count)
    {
        InterpretationStats memory stats = interpretationStats[entityHash];
        if (stats.ratingCount == 0) return (0, 0, 0, 0);
        avgTruth = (stats.totalTruth * 100) / stats.ratingCount;
        avgImportance = (stats.totalImportance * 100) / stats.ratingCount;
        avgMoralImpact = (stats.totalMoralImpact * 100) / stats.ratingCount;
        count = stats.ratingCount;
    }

    function getUserInterpretation(bytes32 entityHash, address user)
        external
        view
        returns (uint8 truth, uint8 importance, uint8 moralImpact, uint256 timestamp, bool exists)
    {
        InterpretationRating memory r = interpretationRatings[entityHash][user];
        return (r.truth, r.importance, r.moralImpact, r.timestamp, r.exists);
    }

    uint256[50] private __gap;
}
