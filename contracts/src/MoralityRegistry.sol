// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    enum EntityType { URL, DOMAIN, ADDRESS, CONTRACT }

    struct Entity {
        bytes32 entityHash;
        EntityType entityType;
        string identifier;
        address registeredBy;
        address claimedOwner;
        uint256 createdAt;
        bool exists;
    }

    struct CanonicalClaim {
        bytes32 claimHash;
        string text;
        address setBy;
        uint256 createdAt;
        uint256 updatedAt;
        uint64 version;
        bool exists;
    }

    struct ClaimRevision {
        bytes32 claimHash;
        string text;
        address updatedBy;
        uint256 timestamp;
        uint64 version;
    }

    mapping(bytes32 => Entity) public entities;
    bytes32[] public entityHashes;
    mapping(bytes32 => address) public approvedClaimants;
    mapping(bytes32 => CanonicalClaim) public canonicalClaims;
    mapping(bytes32 => ClaimRevision[]) private claimRevisions;

    uint256 public constant MAX_CLAIM_LENGTH = 500;

    event EntityRegistered(bytes32 indexed entityHash, EntityType entityType, string identifier, address indexed registeredBy);
    event OwnershipClaimed(bytes32 indexed entityHash, address indexed claimedOwner);
    event OwnershipClaimApproved(bytes32 indexed entityHash, address indexed claimer);
    event CanonicalClaimSet(
        bytes32 indexed entityHash, bytes32 indexed claimHash, string claimText, address indexed setBy, uint64 version
    );
    event CanonicalClaimUpdated(
        bytes32 indexed entityHash,
        bytes32 indexed previousClaimHash,
        bytes32 indexed newClaimHash,
        string claimText,
        address updatedBy,
        uint64 version
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function registerEntity(string calldata identifier, EntityType entityType) external returns (bytes32) {
        bytes32 entityHash = keccak256(abi.encodePacked(identifier));

        if (!entities[entityHash].exists) {
            entities[entityHash] = Entity({
                entityHash: entityHash,
                entityType: entityType,
                identifier: identifier,
                registeredBy: msg.sender,
                claimedOwner: address(0),
                createdAt: block.timestamp,
                exists: true
            });
            entityHashes.push(entityHash);
            emit EntityRegistered(entityHash, entityType, identifier, msg.sender);
        }

        return entityHash;
    }

    function approveOwnershipClaim(bytes32 entityHash, address claimer) external onlyOwner {
        require(entities[entityHash].exists, "Entity does not exist");
        require(entities[entityHash].claimedOwner == address(0), "Already claimed");
        require(claimer != address(0), "Zero address");
        approvedClaimants[entityHash] = claimer;
        emit OwnershipClaimApproved(entityHash, claimer);
    }

    function claimOwnership(bytes32 entityHash) external {
        require(entities[entityHash].exists, "Entity does not exist");
        require(entities[entityHash].claimedOwner == address(0), "Already claimed");
        require(approvedClaimants[entityHash] == msg.sender, "Claim not approved");
        delete approvedClaimants[entityHash];
        entities[entityHash].claimedOwner = msg.sender;
        emit OwnershipClaimed(entityHash, msg.sender);
    }

    function getEntity(bytes32 entityHash) external view returns (Entity memory) {
        require(entities[entityHash].exists, "Entity does not exist");
        return entities[entityHash];
    }

    function getEntityCount() external view returns (uint256) {
        return entityHashes.length;
    }

    function computeHash(string calldata identifier) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(identifier));
    }

    function setCanonicalClaim(bytes32 entityHash, string calldata claimText) external {
        Entity storage entity = entities[entityHash];
        require(entity.exists, "Entity does not exist");
        require(_canEditEntity(entity), "Not authorized");

        bytes memory claimBytes = bytes(claimText);
        require(claimBytes.length > 0, "Claim required");
        require(claimBytes.length <= MAX_CLAIM_LENGTH, "Claim too long");

        bytes32 newClaimHash = keccak256(claimBytes);
        CanonicalClaim storage current = canonicalClaims[entityHash];

        if (!current.exists) {
            canonicalClaims[entityHash] = CanonicalClaim({
                claimHash: newClaimHash,
                text: claimText,
                setBy: msg.sender,
                createdAt: block.timestamp,
                updatedAt: block.timestamp,
                version: 1,
                exists: true
            });

            claimRevisions[entityHash].push(
                ClaimRevision({
                    claimHash: newClaimHash,
                    text: claimText,
                    updatedBy: msg.sender,
                    timestamp: block.timestamp,
                    version: 1
                })
            );

            emit CanonicalClaimSet(entityHash, newClaimHash, claimText, msg.sender, 1);
            return;
        }

        bytes32 previousClaimHash = current.claimHash;
        uint64 nextVersion = current.version + 1;

        current.claimHash = newClaimHash;
        current.text = claimText;
        current.setBy = msg.sender;
        current.updatedAt = block.timestamp;
        current.version = nextVersion;

        claimRevisions[entityHash].push(
            ClaimRevision({
                claimHash: newClaimHash,
                text: claimText,
                updatedBy: msg.sender,
                timestamp: block.timestamp,
                version: nextVersion
            })
        );

        emit CanonicalClaimUpdated(entityHash, previousClaimHash, newClaimHash, claimText, msg.sender, nextVersion);
    }

    function getCanonicalClaim(bytes32 entityHash) external view returns (CanonicalClaim memory) {
        return canonicalClaims[entityHash];
    }

    function getClaimRevisionCount(bytes32 entityHash) external view returns (uint256) {
        return claimRevisions[entityHash].length;
    }

    function getClaimRevision(bytes32 entityHash, uint256 index) external view returns (ClaimRevision memory) {
        require(index < claimRevisions[entityHash].length, "Index out of bounds");
        return claimRevisions[entityHash][index];
    }

    function computeClaimHash(string calldata claimText) external pure returns (bytes32) {
        return keccak256(bytes(claimText));
    }

    function _canEditEntity(Entity storage entity) internal view returns (bool) {
        if (msg.sender == owner()) return true;
        if (entity.claimedOwner != address(0)) {
            return entity.claimedOwner == msg.sender;
        }
        return entity.registeredBy == msg.sender;
    }

    uint256[50] private __gap;
}
