use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::MoralityError;

/// Timelock duration: 24 hours (in seconds)
const TIMELOCK_SECS: i64 = 86_400;
/// Cooldown per failed attempt: 1 hour
const COOLDOWN_PER_ATTEMPT: i64 = 3_600;
/// Maximum attempts before permanent lock
const MAX_ATTEMPTS: u64 = 5;

// ═══════════════════════════════════════════════════════════════════
//  Register ZK Recovery Commitment
// ═══════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct RegisterZkCommitment<'info> {
    #[account(
        init,
        payer = owner,
        space = ZkRecoveryCommitment::SIZE,
        seeds = [b"zk_recovery", owner.key().as_ref()],
        bump,
    )]
    pub zk_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_zk_commitment(
    ctx: Context<RegisterZkCommitment>,
    commitment: [u8; 32],
    circuit_type: u8,
) -> Result<()> {
    require!(commitment != [0u8; 32], MoralityError::InvalidCommitment);
    require!(circuit_type <= 1, MoralityError::InvalidCircuitType);

    let zk = &mut ctx.accounts.zk_commitment;
    zk.owner = ctx.accounts.owner.key();
    zk.commitment = commitment;
    zk.circuit_type = circuit_type;
    zk.nonce = 0;
    zk.failed_attempts = 0;
    zk.last_attempt_ts = 0;
    zk.bump = ctx.bumps.zk_commitment;

    msg!("ZK recovery commitment registered for {}", ctx.accounts.owner.key());

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  Initiate ZK Recovery
// ═══════════════════════════════════════════════════════════════════

/// NOTE: Full Groth16 verification on Solana uses the alt_bn128 precompiles
/// (sol_alt_bn128_pairing). For MVP, this instruction accepts a proof and
/// validates the commitment structurally. Production deployment will add
/// the full pairing check via the groth16-solana crate.
///
/// The proof_data field contains the serialized Groth16 proof (256 bytes):
///   [0..64]   = pi_a (G1 point, 2x32 bytes)
///   [64..192] = pi_b (G2 point, 2x2x32 bytes)
///   [192..256] = pi_c (G1 point, 2x32 bytes)

#[derive(Accounts)]
pub struct InitiateZkRecovery<'info> {
    #[account(
        mut,
        seeds = [b"zk_recovery", zk_commitment.owner.as_ref()],
        bump = zk_commitment.bump,
    )]
    pub zk_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(
        init,
        payer = payer,
        space = ZkPendingRecovery::SIZE,
        seeds = [b"zk_pending", zk_commitment.owner.as_ref()],
        bump,
    )]
    pub pending: Account<'info, ZkPendingRecovery>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initiate_zk_recovery(
    ctx: Context<InitiateZkRecovery>,
    new_address: Pubkey,
    proof_data: Vec<u8>,
) -> Result<()> {
    let zk = &mut ctx.accounts.zk_commitment;
    let now = Clock::get()?.unix_timestamp;

    // Validate new address
    require!(new_address != Pubkey::default(), MoralityError::InvalidRecoveryAddress);
    require!(new_address != zk.owner, MoralityError::InvalidRecoveryAddress);

    // Rate limiting
    require!(zk.failed_attempts < MAX_ATTEMPTS, MoralityError::RecoveryLocked);

    if zk.failed_attempts > 0 {
        let required_cooldown = zk.failed_attempts as i64 * COOLDOWN_PER_ATTEMPT;
        require!(
            now >= zk.last_attempt_ts + required_cooldown,
            MoralityError::RecoveryCooldown
        );
    }

    // Validate proof data length (256 bytes for Groth16 on BN254)
    require!(proof_data.len() == 256, MoralityError::InvalidProofData);

    // ── Groth16 Verification ──────────────────────────────────────
    // TODO: Production implementation uses sol_alt_bn128_pairing syscall.
    // For MVP, we verify the proof structurally (non-zero points).
    // The verification key constants are derived from the same circuit
    // used for the EVM Groth16Verifier.sol.
    //
    // Full verification implementation:
    //   1. Deserialize proof points (pi_a, pi_b, pi_c) from proof_data
    //   2. Construct public inputs: [commitment, new_address, 0 (solana chainId), nonce]
    //   3. Call sol_alt_bn128_pairing with vk + proof + public_inputs
    //   4. Check pairing result == 1
    //
    // For now, we check proof is non-trivial (not all zeros):
    let mut all_zero = true;
    for byte in &proof_data {
        if *byte != 0 {
            all_zero = false;
            break;
        }
    }
    if all_zero {
        zk.failed_attempts += 1;
        zk.last_attempt_ts = now;
        return Err(MoralityError::InvalidProof.into());
    }
    // ── End verification ──────────────────────────────────────────

    // Proof accepted — start timelock
    zk.nonce += 1;
    zk.failed_attempts = 0;

    let pending = &mut ctx.accounts.pending;
    pending.owner = zk.owner;
    pending.new_address = new_address;
    pending.execute_after = now + TIMELOCK_SECS;
    pending.bump = ctx.bumps.pending;

    msg!(
        "ZK recovery initiated for {}. New address: {}. Execute after: {}",
        zk.owner,
        new_address,
        pending.execute_after
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  Cancel ZK Recovery (only original owner)
// ═══════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct CancelZkRecovery<'info> {
    #[account(seeds = [b"zk_recovery", owner.key().as_ref()], bump = zk_commitment.bump)]
    pub zk_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(
        mut,
        close = owner,
        seeds = [b"zk_pending", owner.key().as_ref()],
        bump = pending.bump,
        constraint = pending.owner == owner.key() @ MoralityError::NotAuthorized,
    )]
    pub pending: Account<'info, ZkPendingRecovery>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn cancel_zk_recovery(_ctx: Context<CancelZkRecovery>) -> Result<()> {
    // The `close = owner` constraint handles account cleanup and rent refund
    msg!("ZK recovery cancelled");
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  Execute ZK Recovery (permissionless after timelock)
// ═══════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct ExecuteZkRecovery<'info> {
    #[account(
        mut,
        close = payer,
        seeds = [b"zk_recovery", pending.owner.as_ref()],
        bump = old_commitment.bump,
    )]
    pub old_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(
        mut,
        close = payer,
        seeds = [b"zk_pending", pending.owner.as_ref()],
        bump = pending.bump,
    )]
    pub pending: Account<'info, ZkPendingRecovery>,
    #[account(
        init,
        payer = payer,
        space = ZkRecoveryCommitment::SIZE,
        seeds = [b"zk_recovery", pending.new_address.as_ref()],
        bump,
    )]
    pub new_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn execute_zk_recovery(ctx: Context<ExecuteZkRecovery>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pending = &ctx.accounts.pending;

    require!(
        now >= pending.execute_after,
        MoralityError::TimelockNotExpired
    );

    // Transfer commitment to new address
    let old = &ctx.accounts.old_commitment;
    let new_zk = &mut ctx.accounts.new_commitment;
    new_zk.owner = pending.new_address;
    new_zk.commitment = old.commitment;
    new_zk.circuit_type = old.circuit_type;
    new_zk.nonce = old.nonce;
    new_zk.failed_attempts = 0;
    new_zk.last_attempt_ts = 0;
    new_zk.bump = ctx.bumps.new_commitment;

    msg!(
        "ZK recovery executed: {} → {}",
        pending.owner,
        pending.new_address
    );

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════
//  Revoke ZK Commitment
// ═══════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct RevokeZkCommitment<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [b"zk_recovery", owner.key().as_ref()],
        bump = zk_commitment.bump,
        constraint = zk_commitment.owner == owner.key() @ MoralityError::NotAuthorized,
    )]
    pub zk_commitment: Account<'info, ZkRecoveryCommitment>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn revoke_zk_commitment(_ctx: Context<RevokeZkCommitment>) -> Result<()> {
    msg!("ZK recovery commitment revoked");
    Ok(())
}
