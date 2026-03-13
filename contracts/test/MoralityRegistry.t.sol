// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityRegistryTest is Test {
    MoralityRegistry internal registry;

    address internal owner = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal charlie = makeAddr("charlie");

    string internal constant IDENTIFIER = "https://example.com/story";

    function setUp() public {
        MoralityRegistry impl = new MoralityRegistry();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(MoralityRegistry.initialize, ())
        );
        registry = MoralityRegistry(address(proxy));
    }

    function test_registerEntityStoresAndEmits() public {
        bytes32 expectedHash = keccak256(abi.encodePacked(IDENTIFIER));

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(registry));
        emit MoralityRegistry.EntityRegistered(expectedHash, MoralityRegistry.EntityType.URL, IDENTIFIER, alice);
        bytes32 returnedHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        assertEq(returnedHash, expectedHash);
        assertEq(registry.getEntityCount(), 1);

        MoralityRegistry.Entity memory entity = registry.getEntity(expectedHash);
        assertEq(entity.entityHash, expectedHash);
        assertEq(uint8(entity.entityType), uint8(MoralityRegistry.EntityType.URL));
        assertEq(entity.identifier, IDENTIFIER);
        assertEq(entity.registeredBy, alice);
        assertEq(entity.claimedOwner, address(0));
        assertTrue(entity.exists);
    }

    function test_registerEntityDuplicateDoesNotOverrideFirst() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        vm.prank(bob);
        registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.DOMAIN);

        assertEq(registry.getEntityCount(), 1);
        MoralityRegistry.Entity memory entity = registry.getEntity(entityHash);
        assertEq(entity.registeredBy, alice);
        assertEq(uint8(entity.entityType), uint8(MoralityRegistry.EntityType.URL));
    }

    function test_approveAndClaimOwnership() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        vm.expectEmit(true, true, false, true, address(registry));
        emit MoralityRegistry.OwnershipClaimApproved(entityHash, bob);
        registry.approveOwnershipClaim(entityHash, bob);
        assertEq(registry.approvedClaimants(entityHash), bob);

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(registry));
        emit MoralityRegistry.OwnershipClaimed(entityHash, bob);
        registry.claimOwnership(entityHash);

        assertEq(registry.approvedClaimants(entityHash), address(0));
        MoralityRegistry.Entity memory entity = registry.getEntity(entityHash);
        assertEq(entity.claimedOwner, bob);
    }

    function test_claimOwnershipRequiresApproval() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        vm.prank(bob);
        vm.expectRevert("Claim not approved");
        registry.claimOwnership(entityHash);
    }

    function test_approveOwnershipClaimRevertsOnInvalidState() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        vm.expectRevert("Zero address");
        registry.approveOwnershipClaim(entityHash, address(0));

        registry.approveOwnershipClaim(entityHash, bob);
        vm.prank(bob);
        registry.claimOwnership(entityHash);

        vm.expectRevert("Already claimed");
        registry.approveOwnershipClaim(entityHash, alice);
    }

    function test_transferOwnershipOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        registry.transferOwnership(alice);

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableInvalidOwner.selector, address(0)));
        registry.transferOwnership(address(0));

        registry.transferOwnership(alice);

        vm.prank(alice);
        registry.transferOwnership(bob);
    }

    function test_setCanonicalClaimInitialAndUpdate() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        string memory firstClaim = "Russia struck civilian apartment buildings in Kharkiv.";
        bytes32 firstHash = keccak256(bytes(firstClaim));
        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(registry));
        emit MoralityRegistry.CanonicalClaimSet(entityHash, firstHash, firstClaim, alice, 1);
        registry.setCanonicalClaim(entityHash, firstClaim);

        MoralityRegistry.CanonicalClaim memory current = registry.getCanonicalClaim(entityHash);
        assertTrue(current.exists);
        assertEq(current.claimHash, firstHash);
        assertEq(current.text, firstClaim);
        assertEq(current.setBy, alice);
        assertEq(current.version, 1);
        assertEq(registry.getClaimRevisionCount(entityHash), 1);

        string memory updatedClaim = "Russian forces struck residential blocks in Kharkiv overnight.";
        bytes32 updatedHash = keccak256(bytes(updatedClaim));
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(registry));
        emit MoralityRegistry.CanonicalClaimUpdated(entityHash, firstHash, updatedHash, updatedClaim, alice, 2);
        registry.setCanonicalClaim(entityHash, updatedClaim);

        current = registry.getCanonicalClaim(entityHash);
        assertEq(current.claimHash, updatedHash);
        assertEq(current.text, updatedClaim);
        assertEq(current.version, 2);
        assertEq(registry.getClaimRevisionCount(entityHash), 2);

        MoralityRegistry.ClaimRevision memory revision = registry.getClaimRevision(entityHash, 1);
        assertEq(revision.version, 2);
        assertEq(revision.claimHash, updatedHash);
        assertEq(revision.updatedBy, alice);
    }

    function test_setCanonicalClaimAuthorizationAndValidation() public {
        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);

        vm.prank(charlie);
        vm.expectRevert("Not authorized");
        registry.setCanonicalClaim(entityHash, "unauthorized claim");

        vm.prank(alice);
        vm.expectRevert("Claim required");
        registry.setCanonicalClaim(entityHash, "");

        string memory tooLong = new string(501);
        vm.prank(alice);
        vm.expectRevert("Claim too long");
        registry.setCanonicalClaim(entityHash, tooLong);

        registry.approveOwnershipClaim(entityHash, bob);
        vm.prank(bob);
        registry.claimOwnership(entityHash);

        vm.prank(alice);
        vm.expectRevert("Not authorized");
        registry.setCanonicalClaim(entityHash, "old registrant cannot edit after claim");

        registry.setCanonicalClaim(entityHash, "owner override works");
    }

    function test_revertsForMissingEntityAndOutOfBoundsRevision() public {
        bytes32 missingEntityHash = keccak256("missing-entity");

        vm.expectRevert("Entity does not exist");
        registry.getEntity(missingEntityHash);

        vm.expectRevert("Entity does not exist");
        registry.approveOwnershipClaim(missingEntityHash, alice);

        vm.prank(alice);
        vm.expectRevert("Entity does not exist");
        registry.claimOwnership(missingEntityHash);

        vm.prank(alice);
        vm.expectRevert("Entity does not exist");
        registry.setCanonicalClaim(missingEntityHash, "claim");

        vm.prank(alice);
        bytes32 entityHash = registry.registerEntity(IDENTIFIER, MoralityRegistry.EntityType.URL);
        vm.prank(alice);
        registry.setCanonicalClaim(entityHash, "initial claim");

        vm.expectRevert("Index out of bounds");
        registry.getClaimRevision(entityHash, 1);
    }

    function test_hashHelpersReturnExpectedValues() public view {
        bytes32 expectedEntityHash = keccak256(abi.encodePacked(IDENTIFIER));
        bytes32 expectedClaimHash = keccak256(bytes("claim text"));

        assertEq(registry.computeHash(IDENTIFIER), expectedEntityHash);
        assertEq(registry.computeClaimHash("claim text"), expectedClaimHash);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        registry.initialize();
    }
}
