use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use crate::state::*;
use crate::errors::MoralityError;
use crate::events;

// ── Initialize ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Config::SIZE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.ai_oracle = Pubkey::default();
    config.entity_count = 0;
    config.next_comment_id = 1;
    config.paused = false;
    config.bump = ctx.bumps.config;
    Ok(())
}

// ── Register Entity ───────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(identifier: String, entity_type: u8)]
pub struct RegisterEntity<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = registrar,
        space = Entity::SIZE,
        seeds = [b"entity", &keccak::hash(identifier.as_bytes()).0],
        bump,
    )]
    pub entity: Account<'info, Entity>,
    #[account(mut)]
    pub registrar: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn register_entity(
    ctx: Context<RegisterEntity>,
    identifier: String,
    entity_type: u8,
) -> Result<()> {
    require!(identifier.len() <= 200, MoralityError::IdentifierTooLong);
    require!(entity_type <= 3, MoralityError::InvalidEntityType);

    let entity_hash = keccak::hash(identifier.as_bytes()).0;

    let entity = &mut ctx.accounts.entity;
    entity.entity_hash = entity_hash;
    entity.entity_type = entity_type;
    entity.identifier = identifier.clone();
    entity.registered_by = ctx.accounts.registrar.key();
    entity.claimed_owner = Pubkey::default();
    entity.approved_claimant = Pubkey::default();
    entity.created_at = Clock::get()?.unix_timestamp;
    entity.bump = ctx.bumps.entity;

    let config = &mut ctx.accounts.config;
    config.entity_count = config.entity_count.checked_add(1).unwrap();

    emit!(events::EntityRegistered {
        entity_hash,
        entity_type,
        identifier,
        registered_by: ctx.accounts.registrar.key(),
    });

    Ok(())
}

// ── Approve Ownership Claim ───────────────────────────────────────────

#[derive(Accounts)]
pub struct ApproveOwnershipClaim<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"entity", &entity.entity_hash],
        bump = entity.bump,
    )]
    pub entity: Account<'info, Entity>,
    pub authority: Signer<'info>,
}

pub fn approve_ownership_claim(
    ctx: Context<ApproveOwnershipClaim>,
    claimer: Pubkey,
) -> Result<()> {
    let entity = &mut ctx.accounts.entity;
    require!(
        entity.claimed_owner == Pubkey::default(),
        MoralityError::AlreadyClaimed
    );
    entity.approved_claimant = claimer;

    emit!(events::OwnershipClaimApproved {
        entity_hash: entity.entity_hash,
        claimer,
    });

    Ok(())
}

// ── Claim Ownership ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ClaimOwnership<'info> {
    #[account(
        mut,
        seeds = [b"entity", &entity.entity_hash],
        bump = entity.bump,
    )]
    pub entity: Account<'info, Entity>,
    pub claimer: Signer<'info>,
}

pub fn claim_ownership(ctx: Context<ClaimOwnership>) -> Result<()> {
    let entity = &mut ctx.accounts.entity;
    require!(
        entity.claimed_owner == Pubkey::default(),
        MoralityError::AlreadyClaimed
    );
    require!(
        entity.approved_claimant == ctx.accounts.claimer.key(),
        MoralityError::ClaimNotApproved
    );
    entity.claimed_owner = ctx.accounts.claimer.key();
    entity.approved_claimant = Pubkey::default();

    emit!(events::OwnershipClaimed {
        entity_hash: entity.entity_hash,
        claimed_owner: ctx.accounts.claimer.key(),
    });

    Ok(())
}

// ── Set Canonical Claim ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetCanonicalClaim<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init_if_needed,
        payer = signer,
        space = CanonicalClaim::SIZE,
        seeds = [b"claim", &entity.entity_hash],
        bump,
    )]
    pub claim: Account<'info, CanonicalClaim>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn set_canonical_claim(
    ctx: Context<SetCanonicalClaim>,
    claim_text: String,
) -> Result<()> {
    let entity = &ctx.accounts.entity;
    let signer = &ctx.accounts.signer;
    let config = &ctx.accounts.config;

    // Authorization: protocol authority, claimed owner, or registrar (only if unclaimed)
    let authorized = signer.key() == config.authority
        || (entity.claimed_owner != Pubkey::default()
            && entity.claimed_owner == signer.key())
        || (entity.claimed_owner == Pubkey::default()
            && entity.registered_by == signer.key());
    require!(authorized, MoralityError::NotAuthorized);

    require!(!claim_text.is_empty(), MoralityError::ClaimRequired);
    require!(claim_text.len() <= 500, MoralityError::ClaimTooLong);

    let claim_hash = keccak::hash(claim_text.as_bytes()).0;
    let now = Clock::get()?.unix_timestamp;

    let claim = &mut ctx.accounts.claim;
    if claim.version == 0 {
        claim.entity_hash = entity.entity_hash;
        claim.created_at = now;
    }
    claim.claim_hash = claim_hash;
    claim.text = claim_text;
    claim.set_by = signer.key();
    claim.updated_at = now;
    claim.version += 1;
    claim.bump = ctx.bumps.claim;

    emit!(events::CanonicalClaimSet {
        entity_hash: entity.entity_hash,
        claim_hash,
        set_by: signer.key(),
        version: claim.version,
    });

    Ok(())
}
