use anchor_lang::prelude::*;

pub mod state;
pub mod instructions;
pub mod errors;
pub mod events;

use instructions::*;

declare_id!("Mora1ityXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod morality {
    use super::*;

    // ── Registry ──────────────────────────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::registry::initialize(ctx)
    }

    pub fn register_entity(
        ctx: Context<RegisterEntity>,
        identifier: String,
        entity_type: u8,
    ) -> Result<()> {
        instructions::registry::register_entity(ctx, identifier, entity_type)
    }

    pub fn approve_ownership_claim(
        ctx: Context<ApproveOwnershipClaim>,
        claimer: Pubkey,
    ) -> Result<()> {
        instructions::registry::approve_ownership_claim(ctx, claimer)
    }

    pub fn claim_ownership(ctx: Context<ClaimOwnership>) -> Result<()> {
        instructions::registry::claim_ownership(ctx)
    }

    pub fn set_canonical_claim(
        ctx: Context<SetCanonicalClaim>,
        claim_text: String,
    ) -> Result<()> {
        instructions::registry::set_canonical_claim(ctx, claim_text)
    }

    // ── Ratings ───────────────────────────────────────────────────────

    pub fn rate(ctx: Context<Rate>, score: u8) -> Result<()> {
        instructions::ratings::rate(ctx, score)
    }

    pub fn rate_with_reason(
        ctx: Context<RateWithReason>,
        score: u8,
        reason: String,
    ) -> Result<()> {
        instructions::ratings::rate_with_reason(ctx, score, reason)
    }

    pub fn rate_interpretation(
        ctx: Context<RateInterpretation>,
        truth: u8,
        importance: u8,
        moral_impact: u8,
        reason: String,
    ) -> Result<()> {
        instructions::ratings::rate_interpretation(ctx, truth, importance, moral_impact, reason)
    }

    // ── Comments ──────────────────────────────────────────────────────

    pub fn post_comment(
        ctx: Context<PostComment>,
        content: String,
        parent_id: u64,
    ) -> Result<()> {
        instructions::comments::post_comment(ctx, content, parent_id)
    }

    pub fn vote_comment(ctx: Context<VoteComment>, vote: i8) -> Result<()> {
        instructions::comments::vote_comment(ctx, vote)
    }

    // ── Tipping ───────────────────────────────────────────────────────

    pub fn tip_entity(ctx: Context<TipEntity>, amount: u64) -> Result<()> {
        instructions::tipping::tip_entity(ctx, amount)
    }

    pub fn tip_comment(ctx: Context<TipComment>, amount: u64) -> Result<()> {
        instructions::tipping::tip_comment(ctx, amount)
    }

    pub fn withdraw_tips(ctx: Context<WithdrawTips>) -> Result<()> {
        instructions::tipping::withdraw_tips(ctx)
    }

    pub fn claim_escrow(ctx: Context<ClaimEscrow>) -> Result<()> {
        instructions::tipping::claim_escrow(ctx)
    }

    // ── Leaderboard ───────────────────────────────────────────────────

    pub fn update_ai_score(
        ctx: Context<UpdateAIScore>,
        score: u64,
    ) -> Result<()> {
        instructions::leaderboard::update_ai_score(ctx, score)
    }

    pub fn set_ai_oracle(ctx: Context<SetAIOracle>, oracle: Pubkey) -> Result<()> {
        instructions::leaderboard::set_ai_oracle(ctx, oracle)
    }
}
