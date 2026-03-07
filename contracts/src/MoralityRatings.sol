// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoralityRegistry.sol";

contract MoralityRatings {
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

    uint256 public constant MAX_REASON_LENGTH = 500;

    event Rated(bytes32 indexed entityHash, address indexed rater, uint8 score);
    event RatingUpdated(bytes32 indexed entityHash, address indexed rater, uint8 oldScore, uint8 newScore);
    event RatedWithReason(bytes32 indexed entityHash, address indexed rater, uint8 score, string reason);
    event RatingWithReasonUpdated(
        bytes32 indexed entityHash, address indexed rater, uint8 oldScore, uint8 newScore, string reason
    );

    constructor(address _registry) {
        registry = MoralityRegistry(_registry);
    }

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

        // Auto-register entity if needed — caller can register via registry first for metadata
        // but rating should work regardless

        if (hasRated[entityHash][msg.sender]) {
            // Update existing rating
            oldScore = userRatings[entityHash][msg.sender].score;
            entityStats[entityHash].totalScore = entityStats[entityHash].totalScore - oldScore + score;
            userRatings[entityHash][msg.sender].score = score;
            userRatings[entityHash][msg.sender].timestamp = block.timestamp;
            entityStats[entityHash].lastUpdated = block.timestamp;
            emit RatingUpdated(entityHash, msg.sender, oldScore, score);
            updated = true;
        } else {
            // New rating
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

    function getAverageRating(bytes32 entityHash) external view returns (uint256 avg, uint256 count) {
        EntityRatingStats memory stats = entityStats[entityHash];
        if (stats.ratingCount == 0) return (0, 0);
        // Returns average * 100 for 2 decimal precision (e.g., 350 = 3.50)
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
        for (uint256 i = 0; i < size; i++) {
            result[i] = allRaters[offset + i];
        }
        return result;
    }
}
