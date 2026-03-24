// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title PooterImageVault — On-chain image registry backed by IPFS
/// @notice Each token represents an image pinned to IPFS. The IPFS CID is stored
///         on-chain alongside a content hash for integrity verification.
///         This is the infrastructure layer — separate from PooterEditions (collectible layer).
///         Images are linked to edition numbers for cross-referencing.
contract PooterImageVault is Initializable, ERC721Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    using Strings for uint256;

    // ── Types ─────────────────────────────────────────────────────────────
    struct ImageRecord {
        string ipfsCID; // "bafkrei..." — content-addressed IPFS hash
        bytes32 contentHash; // keccak256 of the raw image bytes
        uint256 editionNumber; // link back to PooterEditions (0 if standalone)
        uint256 mintedAt; // block.timestamp when minted
    }

    // ── State ─────────────────────────────────────────────────────────────
    uint256 public nextTokenId;
    mapping(uint256 => ImageRecord) public images;
    mapping(uint256 => uint256) public editionToImage; // editionNumber → imageTokenId

    // ── Events ────────────────────────────────────────────────────────────
    event ImageMinted(uint256 indexed tokenId, string ipfsCID, bytes32 contentHash, uint256 indexed editionNumber);

    // ── Errors ────────────────────────────────────────────────────────────
    error EmptyCID();
    error EditionImageAlreadySet(uint256 editionNumber);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC721_init("Pooter Images", "PIMG");
        __Ownable_init(msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Mint ──────────────────────────────────────────────────────────────

    /// @notice Mint an image record. Only owner (server agent).
    /// @param ipfsCID The IPFS CID of the pinned image (e.g. "bafkrei...")
    /// @param contentHash keccak256 of the raw image bytes for integrity verification
    /// @param editionNumber Link to a PooterEditions tokenId (0 if standalone image)
    /// @return tokenId The newly minted image token ID
    function mint(
        string calldata ipfsCID,
        bytes32 contentHash,
        uint256 editionNumber
    ) external onlyOwner returns (uint256 tokenId) {
        if (bytes(ipfsCID).length == 0) revert EmptyCID();
        if (editionNumber > 0 && editionToImage[editionNumber] != 0) {
            revert EditionImageAlreadySet(editionNumber);
        }

        tokenId = ++nextTokenId;
        images[tokenId] = ImageRecord({
            ipfsCID: ipfsCID,
            contentHash: contentHash,
            editionNumber: editionNumber,
            mintedAt: block.timestamp
        });

        if (editionNumber > 0) {
            editionToImage[editionNumber] = tokenId;
        }

        _mint(msg.sender, tokenId);
        emit ImageMinted(tokenId, ipfsCID, contentHash, editionNumber);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /// @notice Get the IPFS CID for an edition's illustration
    /// @param editionNumber The edition number to look up
    /// @return ipfsCID The IPFS CID, or empty string if no image exists
    function getImageByEdition(uint256 editionNumber) external view returns (string memory ipfsCID) {
        uint256 imgId = editionToImage[editionNumber];
        if (imgId == 0) return "";
        return images[imgId].ipfsCID;
    }

    /// @notice Get the full image record for a token
    function getImage(uint256 tokenId)
        external
        view
        returns (string memory ipfsCID, bytes32 contentHash, uint256 editionNumber, uint256 mintedAt)
    {
        ImageRecord storage img = images[tokenId];
        return (img.ipfsCID, img.contentHash, img.editionNumber, img.mintedAt);
    }

    // ── Token URI ─────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat("ipfs://", images[tokenId].ipfsCID);
    }

    uint256[49] private __gap;
}
