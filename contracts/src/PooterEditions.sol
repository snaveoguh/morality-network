// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title PooterEditions — 1/1 Daily Edition NFTs
/// @notice Each token represents a daily edition of pooter world.
///         One token per day, minted by the owner (oracle/deployer).
///         tokenId = edition number (days since epoch).
contract PooterEditions is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using Strings for uint256;

    // ── Constants ──────────────────────────────────────────────────────────
    /// @notice Epoch: March 11 2026 00:00 UTC — Edition #1 = first day
    uint256 public constant EPOCH = 1741651200;
    uint256 private constant SECONDS_PER_DAY = 86400;

    // ── Types ─────────────────────────────────────────────────────────────
    struct Edition {
        bytes32 contentHash;
        uint256 editionDate; // unix timestamp of the edition day
        string dailyTitle;
    }

    // ── State ─────────────────────────────────────────────────────────────
    mapping(uint256 => Edition) public editions;
    string public baseTokenURI;
    uint256 public totalMinted;

    // ── Events ────────────────────────────────────────────────────────────
    event EditionMinted(uint256 indexed tokenId, address indexed minter, bytes32 contentHash, string dailyTitle);
    event BaseTokenURIUpdated(string newBaseTokenURI);

    // ── Errors ────────────────────────────────────────────────────────────
    error EditionAlreadyMinted(uint256 editionNumber);
    error InvalidEditionNumber(uint256 editionNumber);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(string memory _baseTokenURI) public initializer {
        __ERC721_init("Pooter Editions", "POOTER");
        __Ownable_init(msg.sender);
        baseTokenURI = _baseTokenURI;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Mint ──────────────────────────────────────────────────────────────
    /// @notice Mint a daily edition. Only owner (oracle/deployer).
    /// @param editionNumber The edition number (days since epoch, starting at 1)
    /// @param contentHash keccak256 of the editorial content for onchain verification
    /// @param dailyTitle The daily title (e.g. "THE GREAT UNWINDING")
    function mint(uint256 editionNumber, bytes32 contentHash, string calldata dailyTitle) external onlyOwner {
        if (editionNumber == 0) revert InvalidEditionNumber(editionNumber);
        if (_ownerOf(editionNumber) != address(0)) revert EditionAlreadyMinted(editionNumber);

        uint256 editionDate = EPOCH + ((editionNumber - 1) * SECONDS_PER_DAY);

        editions[editionNumber] = Edition({
            contentHash: contentHash,
            editionDate: editionDate,
            dailyTitle: dailyTitle
        });

        _mint(msg.sender, editionNumber);
        totalMinted++;

        emit EditionMinted(editionNumber, msg.sender, contentHash, dailyTitle);
    }

    // ── Views ─────────────────────────────────────────────────────────────
    /// @notice Compute today's edition number from block.timestamp
    function currentEditionNumber() external view returns (uint256) {
        if (block.timestamp < EPOCH) return 0;
        return ((block.timestamp - EPOCH) / SECONDS_PER_DAY) + 1;
    }

    /// @notice Get edition data for a tokenId
    function getEdition(uint256 tokenId) external view returns (bytes32 contentHash, uint256 editionDate, string memory dailyTitle) {
        Edition storage e = editions[tokenId];
        return (e.contentHash, e.editionDate, e.dailyTitle);
    }

    // ── Token URI ─────────────────────────────────────────────────────────
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseTokenURI, tokenId.toString());
    }

    /// @notice Update the base token URI (metadata endpoint)
    function setBaseTokenURI(string calldata _baseTokenURI) external onlyOwner {
        baseTokenURI = _baseTokenURI;
        emit BaseTokenURIUpdated(_baseTokenURI);
    }

    uint256[50] private __gap;
}
