// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoralityRegistry.sol";
import "./MoralityRatings.sol";
import "./MoralityTipping.sol";
import "./MoralityComments.sol";

contract MoralityLeaderboard {
    MoralityRegistry public registry;
    MoralityRatings public ratings;
    MoralityTipping public tipping;
    MoralityComments public comments;

    address public owner;
    address public aiOracle;

    // entityHash => AI score (0-10000, representing 0.00-100.00)
    mapping(bytes32 => uint256) public aiScores;
    // entityHash => last AI score update
    mapping(bytes32 => uint256) public aiScoreUpdatedAt;

    event AIScoreUpdated(bytes32 indexed entityHash, uint256 score, uint256 timestamp);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == aiOracle || msg.sender == owner, "Not oracle");
        _;
    }

    constructor(address _registry, address _ratings, address _tipping, address _comments) {
        registry = MoralityRegistry(_registry);
        ratings = MoralityRatings(_ratings);
        tipping = MoralityTipping(_tipping);
        comments = MoralityComments(_comments);
        owner = msg.sender;
    }

    function setAIOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(aiOracle, _oracle);
        aiOracle = _oracle;
    }

    /// @notice AI oracle updates the score for an entity
    function updateAIScore(bytes32 entityHash, uint256 score) external onlyOracle {
        require(score <= 10000, "Score max 10000");
        aiScores[entityHash] = score;
        aiScoreUpdatedAt[entityHash] = block.timestamp;
        emit AIScoreUpdated(entityHash, score, block.timestamp);
    }

    /// @notice Batch update AI scores
    function batchUpdateAIScores(bytes32[] calldata entityHashes, uint256[] calldata scores) external onlyOracle {
        require(entityHashes.length == scores.length, "Length mismatch");
        for (uint256 i = 0; i < entityHashes.length; i++) {
            require(scores[i] <= 10000, "Score max 10000");
            aiScores[entityHashes[i]] = scores[i];
            aiScoreUpdatedAt[entityHashes[i]] = block.timestamp;
            emit AIScoreUpdated(entityHashes[i], scores[i], block.timestamp);
        }
    }

    /// @notice Calculate composite score for an entity
    /// @dev Score = (onchainRating * 40) + (aiScore * 30) + (tipScore * 20) + (engagementScore * 10)
    /// Returns 0-10000 (0.00-100.00)
    function getCompositeScore(bytes32 entityHash) external view returns (uint256) {
        // Onchain rating component (0-500 from rating avg * 100, normalize to 0-10000)
        (uint256 avgRating, uint256 ratingCount) = ratings.getAverageRating(entityHash);
        uint256 ratingComponent = 0;
        if (ratingCount > 0) {
            // avgRating is 100-500 (1.00-5.00 * 100), normalize to 0-10000
            ratingComponent = ((avgRating - 100) * 10000) / 400;
        }

        // AI score component (already 0-10000)
        uint256 aiComponent = aiScores[entityHash];

        // Tip volume component (logarithmic scale, capped)
        uint256 tipTotal = tipping.entityTipTotals(entityHash);
        uint256 tipComponent = 0;
        if (tipTotal > 0) {
            // Simple tier: 0.001 ETH = 2500, 0.01 ETH = 5000, 0.1 ETH = 7500, 1+ ETH = 10000
            if (tipTotal >= 1 ether) tipComponent = 10000;
            else if (tipTotal >= 0.1 ether) tipComponent = 7500;
            else if (tipTotal >= 0.01 ether) tipComponent = 5000;
            else if (tipTotal >= 0.001 ether) tipComponent = 2500;
            else tipComponent = 1000;
        }

        // Engagement component (comment count, logarithmic)
        uint256 commentCount = comments.getEntityCommentCount(entityHash);
        uint256 engagementComponent = 0;
        if (commentCount >= 100) engagementComponent = 10000;
        else if (commentCount >= 50) engagementComponent = 7500;
        else if (commentCount >= 10) engagementComponent = 5000;
        else if (commentCount >= 3) engagementComponent = 2500;
        else if (commentCount >= 1) engagementComponent = 1000;

        // Weighted composite: 40% rating, 30% AI, 20% tips, 10% engagement
        return (ratingComponent * 40 + aiComponent * 30 + tipComponent * 20 + engagementComponent * 10) / 100;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
