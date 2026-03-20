// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoralityComments.sol";
import "./MoralityRegistry.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MoralityTipping is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable, ReentrancyGuard {
    MoralityRegistry public registry;
    MoralityComments public commentsContract;

    struct TipRecord {
        address tipper;
        uint256 amount;
        uint256 timestamp;
    }

    // entityHash => total tips in wei
    mapping(bytes32 => uint256) public entityTipTotals;
    // entityHash => tip records
    mapping(bytes32 => TipRecord[]) public entityTips;
    // address => total tips received (withdrawable by claimed owners)
    mapping(address => uint256) public balances;
    // entityHash => escrowed tips (for unclaimed entities)
    mapping(bytes32 => uint256) public escrow;
    // address => total tips given
    mapping(address => uint256) public totalTipsGiven;
    // address => total tips received
    mapping(address => uint256) public totalTipsReceived;

    event TipSent(bytes32 indexed entityHash, address indexed tipper, address indexed recipient, uint256 amount);
    event TipEscrowed(bytes32 indexed entityHash, address indexed tipper, uint256 amount);
    event CommentTipped(uint256 indexed commentId, address indexed tipper, address indexed author, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event EscrowClaimed(bytes32 indexed entityHash, address indexed owner, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _registry, address _comments) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        registry = MoralityRegistry(_registry);
        commentsContract = MoralityComments(_comments);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Tip an entity (URL, domain, address, contract)
    function tipEntity(bytes32 entityHash) external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Must send ETH");

        entityTipTotals[entityHash] += msg.value;
        entityTips[entityHash].push(TipRecord({
            tipper: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp
        }));
        totalTipsGiven[msg.sender] += msg.value;

        // Check if entity has a claimed owner
        try registry.getEntity(entityHash) returns (MoralityRegistry.Entity memory entity) {
            if (entity.claimedOwner != address(0)) {
                balances[entity.claimedOwner] += msg.value;
                totalTipsReceived[entity.claimedOwner] += msg.value;
                emit TipSent(entityHash, msg.sender, entity.claimedOwner, msg.value);
            } else {
                escrow[entityHash] += msg.value;
                emit TipEscrowed(entityHash, msg.sender, msg.value);
            }
        } catch {
            // Entity not registered yet — escrow it
            escrow[entityHash] += msg.value;
            emit TipEscrowed(entityHash, msg.sender, msg.value);
        }
    }

    /// @notice Tip a specific comment's author
    function tipComment(uint256 commentId) external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Must send ETH");

        MoralityComments.Comment memory c = commentsContract.getComment(commentId);
        require(c.author != msg.sender, "Cannot tip yourself");

        balances[c.author] += msg.value;
        totalTipsGiven[msg.sender] += msg.value;
        totalTipsReceived[c.author] += msg.value;

        // Update comment tip total
        commentsContract.addTipToComment(commentId, msg.value);

        emit CommentTipped(commentId, msg.sender, c.author, msg.value);
    }

    /// @notice Claim escrowed tips when ownership is verified
    function claimEscrow(bytes32 entityHash) external whenNotPaused nonReentrant {
        MoralityRegistry.Entity memory entity = registry.getEntity(entityHash);
        require(entity.claimedOwner == msg.sender, "Not the owner");
        require(escrow[entityHash] > 0, "No escrowed funds");

        uint256 amount = escrow[entityHash];
        escrow[entityHash] = 0;
        balances[msg.sender] += amount;
        totalTipsReceived[msg.sender] += amount;

        emit EscrowClaimed(entityHash, msg.sender, amount);
    }

    /// @notice Withdraw accumulated tips
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");

        balances[msg.sender] = 0;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Get tip history for an entity (paginated)
    function getEntityTips(bytes32 entityHash, uint256 offset, uint256 limit) external view returns (TipRecord[] memory) {
        TipRecord[] storage allTips = entityTips[entityHash];
        uint256 total = allTips.length;

        if (offset >= total) return new TipRecord[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        TipRecord[] memory result = new TipRecord[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = allTips[offset + i];
        }
        return result;
    }

    function getEntityTipCount(bytes32 entityHash) external view returns (uint256) {
        return entityTips[entityHash].length;
    }

    // ── Admin ────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescue ETH accidentally sent directly to contract.
    /// Only callable by owner to prevent permanent fund lock.
    function rescueETH(address payable to) external onlyOwner {
        require(to != address(0), "Zero address");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "Transfer failed");
    }

    // NOTE: receive() intentionally omitted — direct ETH sends are not
    // tracked in accounting and would be permanently stuck. Use tipEntity()
    // or tipComment() to send tips properly.

    uint256[50] private __gap;
}
