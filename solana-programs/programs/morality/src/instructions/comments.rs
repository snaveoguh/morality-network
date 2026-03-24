use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::MoralityError;

// ── Post Comment ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct PostComment<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        init,
        payer = author,
        space = Comment::SIZE,
        seeds = [b"comment", &config.next_comment_id.to_le_bytes()],
        bump,
    )]
    pub comment: Account<'info, Comment>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn post_comment(
    ctx: Context<PostComment>,
    content: String,
    parent_id: u64,
) -> Result<()> {
    require!(!content.is_empty(), MoralityError::EmptyComment);
    require!(content.len() <= 2000, MoralityError::CommentTooLong);

    let config = &mut ctx.accounts.config;
    let comment_id = config.next_comment_id;
    config.next_comment_id += 1;

    let comment = &mut ctx.accounts.comment;
    comment.id = comment_id;
    comment.entity_hash = ctx.accounts.entity.entity_hash;
    comment.author = ctx.accounts.author.key();
    comment.content = content;
    comment.parent_id = parent_id;
    comment.score = 0;
    comment.tip_total = 0;
    comment.timestamp = Clock::get()?.unix_timestamp;
    comment.bump = ctx.bumps.comment;

    Ok(())
}

// ── Vote on Comment ───────────────────────────────────────────────────

#[derive(Accounts)]
pub struct VoteComment<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"comment", &comment.id.to_le_bytes()],
        bump = comment.bump,
    )]
    pub comment: Account<'info, Comment>,
    #[account(
        init_if_needed,
        payer = voter,
        space = Vote::SIZE,
        seeds = [b"vote", &comment.id.to_le_bytes(), voter.key().as_ref()],
        bump,
    )]
    pub vote: Account<'info, Vote>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn vote_comment(ctx: Context<VoteComment>, vote_value: i8) -> Result<()> {
    require!(vote_value == 1 || vote_value == -1, MoralityError::InvalidVote);
    require!(
        ctx.accounts.comment.author != ctx.accounts.voter.key(),
        MoralityError::SelfVote
    );

    let comment = &mut ctx.accounts.comment;
    let vote = &mut ctx.accounts.vote;

    // Remove old vote, add new
    let old_value = vote.value;
    comment.score = comment.score - old_value as i64 + vote_value as i64;

    vote.comment_id = comment.id;
    vote.voter = ctx.accounts.voter.key();
    vote.value = vote_value;
    vote.bump = ctx.bumps.vote;

    Ok(())
}
