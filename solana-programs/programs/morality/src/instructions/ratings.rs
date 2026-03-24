use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::MoralityError;

// ── Rate (1-5 stars) ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Rate<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init_if_needed,
        payer = rater,
        space = RatingStats::SIZE,
        seeds = [b"rating_stats", &entity.entity_hash],
        bump,
    )]
    pub stats: Account<'info, RatingStats>,
    #[account(
        init_if_needed,
        payer = rater,
        space = UserRating::SIZE,
        seeds = [b"user_rating", &entity.entity_hash, rater.key().as_ref()],
        bump,
    )]
    pub user_rating: Account<'info, UserRating>,
    #[account(mut)]
    pub rater: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn rate(ctx: Context<Rate>, score: u8) -> Result<()> {
    require!(score >= 1 && score <= 5, MoralityError::InvalidScore);

    let stats = &mut ctx.accounts.stats;
    let user_rating = &mut ctx.accounts.user_rating;
    let now = Clock::get()?.unix_timestamp;

    if user_rating.score > 0 {
        // Update existing rating
        let old_score = user_rating.score;
        stats.total_score = stats.total_score.saturating_sub(old_score as u64).saturating_add(score as u64);
    } else {
        // New rating
        stats.entity_hash = ctx.accounts.entity.entity_hash;
        stats.total_score += score as u64;
        stats.rating_count += 1;
        user_rating.entity_hash = ctx.accounts.entity.entity_hash;
        user_rating.rater = ctx.accounts.rater.key();
        user_rating.bump = ctx.bumps.user_rating;
    }

    user_rating.score = score;
    user_rating.timestamp = now;
    stats.last_updated = now;
    stats.bump = ctx.bumps.stats;

    Ok(())
}

// ── Rate with Reason ──────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RateWithReason<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init_if_needed,
        payer = rater,
        space = RatingStats::SIZE,
        seeds = [b"rating_stats", &entity.entity_hash],
        bump,
    )]
    pub stats: Account<'info, RatingStats>,
    #[account(
        init_if_needed,
        payer = rater,
        space = UserRating::SIZE,
        seeds = [b"user_rating", &entity.entity_hash, rater.key().as_ref()],
        bump,
    )]
    pub user_rating: Account<'info, UserRating>,
    #[account(mut)]
    pub rater: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn rate_with_reason(ctx: Context<RateWithReason>, score: u8, reason: String) -> Result<()> {
    require!(score >= 1 && score <= 5, MoralityError::InvalidScore);
    require!(reason.len() <= 500, MoralityError::ReasonTooLong);

    let stats = &mut ctx.accounts.stats;
    let user_rating = &mut ctx.accounts.user_rating;
    let now = Clock::get()?.unix_timestamp;

    if user_rating.score > 0 {
        let old_score = user_rating.score;
        stats.total_score = stats.total_score.saturating_sub(old_score as u64).saturating_add(score as u64);
    } else {
        stats.entity_hash = ctx.accounts.entity.entity_hash;
        stats.total_score += score as u64;
        stats.rating_count += 1;
        user_rating.entity_hash = ctx.accounts.entity.entity_hash;
        user_rating.rater = ctx.accounts.rater.key();
        user_rating.bump = ctx.bumps.user_rating;
    }

    user_rating.score = score;
    user_rating.reason = reason;
    user_rating.timestamp = now;
    stats.last_updated = now;
    stats.bump = ctx.bumps.stats;

    Ok(())
}

// ── Rate Interpretation (truth/importance/moral 0-100) ────────────────

#[derive(Accounts)]
pub struct RateInterpretation<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init_if_needed,
        payer = rater,
        space = RatingStats::SIZE,
        seeds = [b"rating_stats", &entity.entity_hash],
        bump,
    )]
    pub stats: Account<'info, RatingStats>,
    #[account(
        init_if_needed,
        payer = rater,
        space = UserRating::SIZE,
        seeds = [b"user_rating", &entity.entity_hash, rater.key().as_ref()],
        bump,
    )]
    pub user_rating: Account<'info, UserRating>,
    #[account(mut)]
    pub rater: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn rate_interpretation(
    ctx: Context<RateInterpretation>,
    truth: u8,
    importance: u8,
    moral_impact: u8,
    reason: String,
) -> Result<()> {
    require!(truth <= 100, MoralityError::InvalidDimension);
    require!(importance <= 100, MoralityError::InvalidDimension);
    require!(moral_impact <= 100, MoralityError::InvalidDimension);
    require!(reason.len() <= 500, MoralityError::ReasonTooLong);

    let stats = &mut ctx.accounts.stats;
    let user_rating = &mut ctx.accounts.user_rating;
    let now = Clock::get()?.unix_timestamp;

    // Initialize PDA fields if new
    if !user_rating.has_interpretation && user_rating.score == 0 {
        user_rating.entity_hash = ctx.accounts.entity.entity_hash;
        user_rating.rater = ctx.accounts.rater.key();
        user_rating.bump = ctx.bumps.user_rating;
        stats.entity_hash = ctx.accounts.entity.entity_hash;
        stats.bump = ctx.bumps.stats;
    }

    if user_rating.has_interpretation {
        // Update: subtract old, add new
        stats.total_truth = stats.total_truth.saturating_sub(user_rating.truth as u64).saturating_add(truth as u64);
        stats.total_importance = stats.total_importance.saturating_sub(user_rating.importance as u64).saturating_add(importance as u64);
        stats.total_moral_impact = stats.total_moral_impact.saturating_sub(user_rating.moral_impact as u64).saturating_add(moral_impact as u64);
    } else {
        stats.total_truth += truth as u64;
        stats.total_importance += importance as u64;
        stats.total_moral_impact += moral_impact as u64;
        stats.interpretation_count += 1;
    }

    user_rating.truth = truth;
    user_rating.importance = importance;
    user_rating.moral_impact = moral_impact;
    user_rating.has_interpretation = true;
    user_rating.timestamp = now;
    if !reason.is_empty() {
        user_rating.reason = reason;
    }
    stats.last_updated = now;

    Ok(())
}
