use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::MoralityError;

// ── Update AI Score ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateAIScore<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init_if_needed,
        payer = oracle,
        space = AIScore::SIZE,
        seeds = [b"ai_score", &entity.entity_hash],
        bump,
    )]
    pub ai_score: Account<'info, AIScore>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_ai_score(ctx: Context<UpdateAIScore>, score: u64) -> Result<()> {
    let config = &ctx.accounts.config;
    let oracle = &ctx.accounts.oracle;

    require!(!config.paused, MoralityError::Paused);
    // Must be oracle or authority
    require!(
        oracle.key() == config.ai_oracle || oracle.key() == config.authority,
        MoralityError::NotOracle
    );
    require!(score <= 10000, MoralityError::InvalidAIScore);

    let ai_score = &mut ctx.accounts.ai_score;
    ai_score.entity_hash = ctx.accounts.entity.entity_hash;
    ai_score.score = score;
    ai_score.updated_at = Clock::get()?.unix_timestamp;
    ai_score.bump = ctx.bumps.ai_score;

    Ok(())
}

// ── Set AI Oracle ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetAIOracle<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority,
    )]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
}

pub fn set_ai_oracle(ctx: Context<SetAIOracle>, oracle: Pubkey) -> Result<()> {
    ctx.accounts.config.ai_oracle = oracle;
    Ok(())
}

/// Compute composite score off-chain (view-equivalent).
/// On Solana, this is typically computed client-side from the PDAs.
/// The formula matches the Solidity version:
///   score = (rating_component * 40 + ai_component * 30 + tip_component * 20 + engagement_component * 10) / 100
///
/// Rating component: ((avg_rating - 100) * 10000) / 400 where avg = totalScore * 100 / count
/// AI component: ai_score (already 0-10000)
/// Tip component: logarithmic tiers based on SOL amount
/// Engagement component: logarithmic tiers based on comment count
///
/// This is exposed as a client-side helper in the SDK, not as an on-chain instruction,
/// because Solana programs can't easily read multiple PDAs in a view function.
