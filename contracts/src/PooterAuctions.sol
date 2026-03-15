// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPooterEditions {
    function mintFor(address to, uint256 editionNumber, bytes32 contentHash, string calldata dailyTitle) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function currentEditionNumber() external view returns (uint256);
}

/// @title PooterAuctions — On-demand 24hr auctions for Pooter Edition NFTs
/// @notice Anyone can start an auction on any unminted past edition.
///         Highest bidder after 24hrs wins the 1/1 NFT. Proceeds go to treasury.
contract PooterAuctions is Ownable, ReentrancyGuard {

    // ── Constants ──────────────────────────────────────────────────────────
    uint256 public constant DURATION = 86400; // 24 hours
    uint256 public constant TIME_BUFFER = 300; // 5 min anti-snipe extension
    uint256 public constant MIN_BID = 0.001 ether;
    uint256 public constant MIN_BID_INCREMENT_BPS = 1000; // 10%

    // ── Types ─────────────────────────────────────────────────────────────
    struct Auction {
        uint256 startTime;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bytes32 contentHash;
        string dailyTitle;
        bool settled;
    }

    // ── State ─────────────────────────────────────────────────────────────
    IPooterEditions public immutable editions;
    address public treasury;

    mapping(uint256 => Auction) public auctions; // editionNumber => Auction
    mapping(address => uint256) public pendingReturns;

    // ── Events ────────────────────────────────────────────────────────────
    event AuctionCreated(uint256 indexed editionNumber, address indexed creator, uint256 firstBid);
    event AuctionBid(uint256 indexed editionNumber, address indexed bidder, uint256 amount, bool extended);
    event AuctionSettled(uint256 indexed editionNumber, address indexed winner, uint256 amount);
    event AuctionExtended(uint256 indexed editionNumber, uint256 newEndTime);
    event TreasuryUpdated(address indexed newTreasury);

    // ── Errors ────────────────────────────────────────────────────────────
    error EditionAlreadyMinted();
    error FutureEdition();
    error AuctionAlreadyExists();
    error AuctionNotFound();
    error AuctionEnded();
    error AuctionNotEnded();
    error AuctionAlreadySettled();
    error BidTooLow();
    error NoPendingReturn();
    error TransferFailed();

    constructor(address _editions, address _treasury) Ownable(msg.sender) {
        editions = IPooterEditions(_editions);
        treasury = _treasury;
    }

    // ── Create ────────────────────────────────────────────────────────────
    /// @notice Start a new auction on an unminted past edition. First bid required.
    function createAuction(
        uint256 editionNumber,
        bytes32 contentHash,
        string calldata dailyTitle
    ) external payable nonReentrant {
        if (editionNumber >= editions.currentEditionNumber()) revert FutureEdition();
        if (auctions[editionNumber].startTime != 0) revert AuctionAlreadyExists();
        if (msg.value < MIN_BID) revert BidTooLow();

        // Check edition not already minted (ownerOf reverts for unminted tokens)
        try editions.ownerOf(editionNumber) {
            revert EditionAlreadyMinted();
        } catch {
            // Good — edition is not minted
        }

        auctions[editionNumber] = Auction({
            startTime: block.timestamp,
            endTime: block.timestamp + DURATION,
            highestBidder: msg.sender,
            highestBid: msg.value,
            contentHash: contentHash,
            dailyTitle: dailyTitle,
            settled: false
        });

        emit AuctionCreated(editionNumber, msg.sender, msg.value);
    }

    // ── Bid ───────────────────────────────────────────────────────────────
    /// @notice Place a bid on an active auction.
    function bid(uint256 editionNumber) external payable nonReentrant {
        Auction storage a = auctions[editionNumber];
        if (a.startTime == 0) revert AuctionNotFound();
        if (block.timestamp >= a.endTime) revert AuctionEnded();

        uint256 minRequired = a.highestBid + (a.highestBid * MIN_BID_INCREMENT_BPS / 10000);
        if (minRequired < MIN_BID) minRequired = MIN_BID;
        if (msg.value < minRequired) revert BidTooLow();

        // Queue refund for previous bidder (pull pattern)
        if (a.highestBidder != address(0)) {
            pendingReturns[a.highestBidder] += a.highestBid;
        }

        a.highestBidder = msg.sender;
        a.highestBid = msg.value;

        // Anti-snipe: extend if bid in last TIME_BUFFER seconds
        bool extended = false;
        if (a.endTime - block.timestamp < TIME_BUFFER) {
            a.endTime = block.timestamp + TIME_BUFFER;
            extended = true;
            emit AuctionExtended(editionNumber, a.endTime);
        }

        emit AuctionBid(editionNumber, msg.sender, msg.value, extended);
    }

    // ── Settle ────────────────────────────────────────────────────────────
    /// @notice Settle an ended auction. Mints NFT to winner, sends ETH to treasury.
    function settle(uint256 editionNumber) external nonReentrant {
        Auction storage a = auctions[editionNumber];
        if (a.startTime == 0) revert AuctionNotFound();
        if (block.timestamp < a.endTime) revert AuctionNotEnded();
        if (a.settled) revert AuctionAlreadySettled();

        a.settled = true;

        // Mint to winner
        editions.mintFor(a.highestBidder, editionNumber, a.contentHash, a.dailyTitle);

        // Send proceeds to treasury
        (bool sent, ) = treasury.call{value: a.highestBid}("");
        if (!sent) revert TransferFailed();

        emit AuctionSettled(editionNumber, a.highestBidder, a.highestBid);
    }

    // ── Withdraw ──────────────────────────────────────────────────────────
    /// @notice Withdraw pending returns from being outbid.
    function withdrawPendingReturn() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (amount == 0) revert NoPendingReturn();

        pendingReturns[msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    // ── Admin ─────────────────────────────────────────────────────────────
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
}
