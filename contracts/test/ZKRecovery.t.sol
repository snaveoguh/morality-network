// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ZKRecovery} from "../src/ZKRecovery.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";

/**
 * @title ZKRecoveryTest
 * @notice Comprehensive test suite for ZK password recovery contract.
 *
 * Note: Uses the placeholder Groth16Verifier which always returns true.
 * In production, these tests would use pre-computed valid/invalid proofs
 * from the real circuit. The placeholder lets us test all contract logic
 * (timelock, rate limiting, nonce, etc.) without circuit dependencies.
 */
contract ZKRecoveryTest is Test {
    ZKRecovery public recovery;
    Groth16Verifier public verifier;

    address public owner = address(0xA11CE);
    address public newWallet = address(0xB0B);
    address public attacker = address(0xBAD);
    address public deployer = address(this);

    bytes32 constant COMMITMENT = bytes32(uint256(0xdeadbeef));
    bytes32 constant NEW_COMMITMENT = bytes32(uint256(0xcafebabe));

    // Dummy proof (placeholder verifier accepts anything)
    uint[2] pA = [uint(0), uint(0)];
    uint[2][2] pB = [[uint(0), uint(0)], [uint(0), uint(0)]];
    uint[2] pC = [uint(0), uint(0)];

    function setUp() public {
        verifier = new Groth16Verifier();
        recovery = ZKRecovery(address(new ERC1967Proxy(
            address(new ZKRecovery()),
            abi.encodeCall(ZKRecovery.initialize, (address(verifier)))
        )));
    }

    // ═══════════════════════════════════════════════════════════════
    //  Commitment Registration
    // ═══════════════════════════════════════════════════════════════

    function test_registerCommitment() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        ZKRecovery.RecoveryCommitment memory c = recovery.getCommitment(owner);
        assertEq(c.commitment, COMMITMENT);
        assertEq(c.circuitType, 0);
        assertEq(c.nonce, 0);
        assertEq(c.failedAttempts, 0);
        assertTrue(c.exists);
        assertTrue(recovery.isRecoverable(owner));
    }

    function test_registerCommitment_revertsDuplicate() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(owner);
        vm.expectRevert(ZKRecovery.CommitmentAlreadyExists.selector);
        recovery.registerCommitment(COMMITMENT, 0);
    }

    function test_registerCommitment_revertsZeroCommitment() public {
        vm.prank(owner);
        vm.expectRevert(ZKRecovery.InvalidAddress.selector);
        recovery.registerCommitment(bytes32(0), 0);
    }

    function test_updateCommitment() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(owner);
        recovery.updateCommitment(NEW_COMMITMENT);

        ZKRecovery.RecoveryCommitment memory c = recovery.getCommitment(owner);
        assertEq(c.commitment, NEW_COMMITMENT);
        assertEq(c.nonce, 1); // Nonce incremented to invalidate old proofs
        assertEq(c.failedAttempts, 0); // Reset
    }

    function test_updateCommitment_revertsIfNoneExists() public {
        vm.prank(owner);
        vm.expectRevert(ZKRecovery.CommitmentNotFound.selector);
        recovery.updateCommitment(NEW_COMMITMENT);
    }

    function test_revokeCommitment() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(owner);
        recovery.revokeCommitment();

        assertFalse(recovery.isRecoverable(owner));
    }

    // ═══════════════════════════════════════════════════════════════
    //  Recovery Happy Path
    // ═══════════════════════════════════════════════════════════════

    function test_fullRecoveryFlow() public {
        // 1. Register commitment
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        // 2. Initiate recovery (anyone can call)
        vm.prank(newWallet);
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        // 3. Check pending
        ZKRecovery.PendingRecovery memory p = recovery.getPendingRecovery(owner);
        assertTrue(p.exists);
        assertEq(p.newAddress, newWallet);
        assertEq(p.executeAfter, block.timestamp + 24 hours);

        // 4. Nonce incremented
        ZKRecovery.RecoveryCommitment memory c = recovery.getCommitment(owner);
        assertEq(c.nonce, 1);

        // 5. Wait for timelock
        vm.warp(block.timestamp + 24 hours + 1);

        // 6. Execute (permissionless)
        recovery.executeRecovery(owner);

        // 7. Commitment transferred to new address
        assertFalse(recovery.isRecoverable(owner));
        assertTrue(recovery.isRecoverable(newWallet));

        ZKRecovery.RecoveryCommitment memory newC = recovery.getCommitment(newWallet);
        assertEq(newC.commitment, COMMITMENT);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Timelock
    // ═══════════════════════════════════════════════════════════════

    function test_executeRecovery_revertsBeforeTimelock() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(newWallet);
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        // Try to execute immediately
        vm.expectRevert(ZKRecovery.TimelockNotExpired.selector);
        recovery.executeRecovery(owner);

        // Try at 23 hours
        vm.warp(block.timestamp + 23 hours);
        vm.expectRevert(ZKRecovery.TimelockNotExpired.selector);
        recovery.executeRecovery(owner);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Cancel
    // ═══════════════════════════════════════════════════════════════

    function test_cancelRecovery() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(newWallet);
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        // Owner cancels
        vm.prank(owner);
        recovery.cancelRecovery();

        ZKRecovery.PendingRecovery memory p = recovery.getPendingRecovery(owner);
        assertFalse(p.exists);

        // Commitment still intact
        assertTrue(recovery.isRecoverable(owner));
    }

    function test_cancelRecovery_revertsIfNotOwner() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(newWallet);
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        // Attacker tries to cancel
        vm.prank(attacker);
        vm.expectRevert(ZKRecovery.NoPendingRecovery.selector);
        recovery.cancelRecovery();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Rate Limiting (requires mock verifier that can return false)
    // ═══════════════════════════════════════════════════════════════

    function test_cannotInitiateIfPendingExists() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(newWallet);
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        // Try again while pending
        vm.prank(attacker);
        vm.expectRevert(ZKRecovery.PendingRecoveryExists.selector);
        recovery.initiateRecovery(owner, attacker, pA, pB, pC);
    }

    function test_cannotRecoverSelfAddress() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.prank(owner);
        vm.expectRevert(ZKRecovery.InvalidAddress.selector);
        recovery.initiateRecovery(owner, owner, pA, pB, pC);
    }

    function test_cannotRecoverZeroAddress() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        vm.expectRevert(ZKRecovery.InvalidAddress.selector);
        recovery.initiateRecovery(owner, address(0), pA, pB, pC);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Nonce Replay Prevention
    // ═══════════════════════════════════════════════════════════════

    function test_nonceIncrementsAfterRecovery() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        // First recovery
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        ZKRecovery.RecoveryCommitment memory c = recovery.getCommitment(owner);
        assertEq(c.nonce, 1);

        // Cancel and try again — nonce is still 1
        vm.prank(owner);
        recovery.cancelRecovery();

        // Second recovery attempt works (nonce is now 1)
        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        c = recovery.getCommitment(owner);
        assertEq(c.nonce, 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  View Functions
    // ═══════════════════════════════════════════════════════════════

    function test_cooldownRemaining_zeroWhenNoAttempts() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        assertEq(recovery.cooldownRemaining(owner), 0);
    }

    function test_isLocked_falseByDefault() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        assertFalse(recovery.isLocked(owner));
    }

    // ═══════════════════════════════════════════════════════════════
    //  Update During Pending — Blocked
    // ═══════════════════════════════════════════════════════════════

    function test_updateCommitment_revertsIfPendingRecovery() public {
        vm.prank(owner);
        recovery.registerCommitment(COMMITMENT, 0);

        recovery.initiateRecovery(owner, newWallet, pA, pB, pC);

        vm.prank(owner);
        vm.expectRevert(ZKRecovery.PendingRecoveryExists.selector);
        recovery.updateCommitment(NEW_COMMITMENT);
    }
}
