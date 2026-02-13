// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MoralityComments {
    struct Comment {
        uint256 id;
        bytes32 entityHash;
        address author;
        string content;
        uint256 parentId; // 0 = top-level comment
        int256 score; // upvotes - downvotes
        uint256 tipTotal;
        uint256 timestamp;
        bool exists;
    }

    uint256 public nextCommentId = 1;
    mapping(uint256 => Comment) public comments;
    mapping(bytes32 => uint256[]) public entityComments; // entityHash => commentIds
    mapping(uint256 => uint256[]) public childComments; // parentId => childIds
    mapping(uint256 => mapping(address => int8)) public votes; // commentId => voter => vote (+1/-1)

    event CommentCreated(uint256 indexed commentId, bytes32 indexed entityHash, address indexed author, uint256 parentId);
    event CommentVoted(uint256 indexed commentId, address indexed voter, int8 vote);

    function comment(bytes32 entityHash, string calldata content, uint256 parentId) external returns (uint256) {
        require(bytes(content).length > 0, "Empty comment");
        require(bytes(content).length <= 2000, "Comment too long");

        if (parentId > 0) {
            require(comments[parentId].exists, "Parent does not exist");
            require(comments[parentId].entityHash == entityHash, "Parent entity mismatch");
        }

        uint256 commentId = nextCommentId++;
        comments[commentId] = Comment({
            id: commentId,
            entityHash: entityHash,
            author: msg.sender,
            content: content,
            parentId: parentId,
            score: 0,
            tipTotal: 0,
            timestamp: block.timestamp,
            exists: true
        });

        entityComments[entityHash].push(commentId);
        if (parentId > 0) {
            childComments[parentId].push(commentId);
        }

        emit CommentCreated(commentId, entityHash, msg.sender, parentId);
        return commentId;
    }

    function vote(uint256 commentId, int8 v) external {
        require(comments[commentId].exists, "Comment does not exist");
        require(v == 1 || v == -1, "Vote must be +1 or -1");
        require(comments[commentId].author != msg.sender, "Cannot vote own comment");

        int8 previousVote = votes[commentId][msg.sender];
        votes[commentId][msg.sender] = v;

        // Adjust score: remove old vote, add new
        comments[commentId].score = comments[commentId].score - int256(previousVote) + int256(v);

        emit CommentVoted(commentId, msg.sender, v);
    }

    function getComment(uint256 commentId) external view returns (Comment memory) {
        require(comments[commentId].exists, "Comment does not exist");
        return comments[commentId];
    }

    function getEntityComments(bytes32 entityHash, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256[] storage allIds = entityComments[entityHash];
        uint256 total = allIds.length;

        if (offset >= total) return new uint256[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        uint256[] memory result = new uint256[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = allIds[offset + i];
        }
        return result;
    }

    function getChildComments(uint256 parentId) external view returns (uint256[] memory) {
        return childComments[parentId];
    }

    function getEntityCommentCount(bytes32 entityHash) external view returns (uint256) {
        return entityComments[entityHash].length;
    }

    /// @dev Called by MoralityTipping to update tip totals
    function addTipToComment(uint256 commentId, uint256 amount) external {
        require(comments[commentId].exists, "Comment does not exist");
        comments[commentId].tipTotal += amount;
    }
}
