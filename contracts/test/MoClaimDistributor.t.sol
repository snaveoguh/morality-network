// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoToken.sol";
import "../src/MoClaimDistributor.sol";

contract MoClaimDistributorTest is Test {
    MoToken token;
    MoClaimDistributor dist;

    address safe = address(0x5AFE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 aliceAmount = 1_000 ether;
    uint256 bobAmount = 2_500 ether;

    bytes32 leafAlice;
    bytes32 leafBob;
    bytes32 root;

    function setUp() public {
        token = new MoToken(safe, 3_000_000 ether);
        dist = new MoClaimDistributor(IERC20(address(token)), safe);

        // Two-leaf tree in the OZ standard-merkle-tree format:
        // leaf = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))))
        // parent = keccak256(sorted(leafA, leafB)) — MerkleProof's commutative pair hash.
        leafAlice = keccak256(bytes.concat(keccak256(abi.encode(uint256(0), alice, aliceAmount))));
        leafBob = keccak256(bytes.concat(keccak256(abi.encode(uint256(1), bob, bobAmount))));
        root = _hashPair(leafAlice, leafBob);

        vm.prank(safe);
        dist.setRoot(1, root);
        vm.prank(safe);
        token.transfer(address(dist), aliceAmount + bobAmount);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _aliceProof() internal view returns (bytes32[] memory proof) {
        proof = new bytes32[](1);
        proof[0] = leafBob;
    }

    function testClaimPaysOut() public {
        dist.claim(1, 0, alice, aliceAmount, _aliceProof());
        assertEq(token.balanceOf(alice), aliceAmount);
        assertTrue(dist.isClaimed(1, 0));
    }

    function testClaimCallableByAnyoneButPaysAccount() public {
        vm.prank(bob);
        dist.claim(1, 0, alice, aliceAmount, _aliceProof());
        assertEq(token.balanceOf(alice), aliceAmount);
        assertEq(token.balanceOf(bob), 0);
    }

    function testDoubleClaimReverts() public {
        dist.claim(1, 0, alice, aliceAmount, _aliceProof());
        vm.expectRevert(MoClaimDistributor.AlreadyClaimed.selector);
        dist.claim(1, 0, alice, aliceAmount, _aliceProof());
    }

    function testWrongAmountReverts() public {
        vm.expectRevert(MoClaimDistributor.InvalidProof.selector);
        dist.claim(1, 0, alice, aliceAmount + 1, _aliceProof());
    }

    function testWrongAccountReverts() public {
        vm.expectRevert(MoClaimDistributor.InvalidProof.selector);
        dist.claim(1, 0, bob, aliceAmount, _aliceProof());
    }

    function testRetiredEpochReverts() public {
        vm.prank(safe);
        dist.setRoot(1, bytes32(0));
        vm.expectRevert(MoClaimDistributor.EpochClosed.selector);
        dist.claim(1, 0, alice, aliceAmount, _aliceProof());
    }

    function testOnlySafeSetsRoot() public {
        vm.prank(alice);
        vm.expectRevert(MoClaimDistributor.NotRootSetter.selector);
        dist.setRoot(2, bytes32(uint256(1)));
    }

    function testRecoverOnlySafeAndPaysSafe() public {
        vm.prank(alice);
        vm.expectRevert(MoClaimDistributor.NotRootSetter.selector);
        dist.recover(1 ether);

        uint256 before = token.balanceOf(safe);
        vm.prank(safe);
        dist.recover(1 ether);
        assertEq(token.balanceOf(safe), before + 1 ether);
    }

    function testTokenIsFixedSupplyNoOwner() public view {
        assertEq(token.totalSupply(), 3_000_000 ether);
        // No mint/owner functions exist — compile-time guarantee; nothing to call.
    }
}
