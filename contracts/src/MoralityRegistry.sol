// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MoralityRegistry {
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

    mapping(bytes32 => Entity) public entities;
    bytes32[] public entityHashes;

    event EntityRegistered(bytes32 indexed entityHash, EntityType entityType, string identifier, address indexed registeredBy);
    event OwnershipClaimed(bytes32 indexed entityHash, address indexed claimedOwner);

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

    function claimOwnership(bytes32 entityHash) external {
        require(entities[entityHash].exists, "Entity does not exist");
        require(entities[entityHash].claimedOwner == address(0), "Already claimed");
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
}
