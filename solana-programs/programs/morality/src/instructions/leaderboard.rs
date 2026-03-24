use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::MoralityError;
use crate::events;

const AI_SCORE_COOLDOWN_SECS: i64 = 300; // 5 minutes

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
    let now = Clock::get()?.unix_timestamp;

    require!(!config.paused, MoralityError::Paused);
    // Oracle must be configured (M-3 fix)
    require!(
        config.ai_oracle != Pubkey::default() || oracle.key() == config.authority,
        MoralityError::OracleNotSet
    );
    // Must be oracle or authority
    require!(
        oracle.key() == config.ai_oracle || oracle.key() == config.authority,
        MoralityError::NotOracle
    );
    require!(score <= 10000, MoralityError::InvalidAIScore);

    let ai_score = &mut ctx.accounts.ai_score;

    // Cooldown: 5 min between updates per entity (H-1 fix)
    // Skip cooldown check on first update (updated_at == 0)
    if ai_score.updated_at > 0 {
        require!(
            now - ai_score.updated_at >= AI_SCORE_COOLDOWN_SECS,
            MoralityError::TooFrequent
        );
    }

    ai_score.entity_hash = ctx.accounts.entity.entity_hash;
    ai_score.score = score;
    ai_score.updated_at = now;
    ai_score.bump = ctx.bumps.ai_score;

    emit!(events::AIScoreUpdated {
        entity_hash: ctx.accounts.entity.entity_hash,
        score,
        timestamp: now,
    });

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
    let old_oracle = ctx.accounts.config.ai_oracle;
    ctx.accounts.config.ai_oracle = oracle;

    emit!(events::OracleUpdated {
        old_oracle,
        new_oracle: oracle,
    });

    Ok(())
}

/// Composite score is computed client-side from PDAs (same formula as Solidity):
///   score = (rating_component * 40 + ai_component * 30 + tip_component * 20 + engagement_component * 10) / 100
/// See SDK for implementation.
