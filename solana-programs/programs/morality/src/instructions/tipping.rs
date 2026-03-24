use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::MoralityError;

// ── Tip Entity ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct TipEntity<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    /// Balance account for the entity's claimed owner (if claimed).
    /// Created if needed. If entity is unclaimed, escrow is used instead.
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipBalance::SIZE,
        seeds = [b"balance", entity.claimed_owner.as_ref()],
        bump,
    )]
    pub owner_balance: Option<Account<'info, TipBalance>>,
    #[account(
        init_if_needed,
        payer = tipper,
        space = Escrow::SIZE,
        seeds = [b"escrow", &entity.entity_hash],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,
    /// Tipper's balance account (for tracking total_given)
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipBalance::SIZE,
        seeds = [b"balance", tipper.key().as_ref()],
        bump,
    )]
    pub tipper_balance: Account<'info, TipBalance>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn tip_entity(ctx: Context<TipEntity>, amount: u64) -> Result<()> {
    require!(amount > 0, MoralityError::ZeroTip);
    require!(!ctx.accounts.config.paused, MoralityError::Paused);

    let entity = &ctx.accounts.entity;

    // Transfer SOL from tipper to escrow PDA (which holds all tip funds)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.tipper.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
            },
        ),
        amount,
    )?;

    // Track tipper stats
    let tipper_balance = &mut ctx.accounts.tipper_balance;
    tipper_balance.owner = ctx.accounts.tipper.key();
    tipper_balance.total_given += amount;
    tipper_balance.bump = ctx.bumps.tipper_balance;

    if entity.claimed_owner != Pubkey::default() {
        // Entity is claimed — credit owner's balance
        if let Some(owner_balance) = &mut ctx.accounts.owner_balance {
            owner_balance.owner = entity.claimed_owner;
            owner_balance.amount += amount;
            owner_balance.total_received += amount;
            owner_balance.bump = ctx.bumps.owner_balance.unwrap_or(0);
        }
    } else {
        // Entity unclaimed — track in escrow
        let escrow = &mut ctx.accounts.escrow;
        escrow.entity_hash = entity.entity_hash;
        escrow.amount += amount;
        escrow.bump = ctx.bumps.escrow;
    }

    Ok(())
}

// ── Tip Comment ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct TipComment<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"comment", &comment.id.to_le_bytes()],
        bump = comment.bump,
    )]
    pub comment: Account<'info, Comment>,
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipBalance::SIZE,
        seeds = [b"balance", comment.author.as_ref()],
        bump,
    )]
    pub author_balance: Account<'info, TipBalance>,
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipBalance::SIZE,
        seeds = [b"balance", tipper.key().as_ref()],
        bump,
    )]
    pub tipper_balance: Account<'info, TipBalance>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn tip_comment(ctx: Context<TipComment>, amount: u64) -> Result<()> {
    require!(amount > 0, MoralityError::ZeroTip);
    require!(!ctx.accounts.config.paused, MoralityError::Paused);
    require!(
        ctx.accounts.comment.author != ctx.accounts.tipper.key(),
        MoralityError::SelfTip
    );

    // Transfer SOL to author balance PDA
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.tipper.to_account_info(),
                to: ctx.accounts.author_balance.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update comment tip total
    ctx.accounts.comment.tip_total += amount;

    // Track balances
    let author_balance = &mut ctx.accounts.author_balance;
    author_balance.owner = ctx.accounts.comment.author;
    author_balance.amount += amount;
    author_balance.total_received += amount;
    author_balance.bump = ctx.bumps.author_balance;

    let tipper_balance = &mut ctx.accounts.tipper_balance;
    tipper_balance.owner = ctx.accounts.tipper.key();
    tipper_balance.total_given += amount;
    tipper_balance.bump = ctx.bumps.tipper_balance;

    Ok(())
}

// ── Withdraw Tips ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct WithdrawTips<'info> {
    #[account(
        mut,
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
        has_one = owner,
    )]
    pub balance: Account<'info, TipBalance>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_tips(ctx: Context<WithdrawTips>) -> Result<()> {
    let balance = &mut ctx.accounts.balance;
    let amount = balance.amount;
    require!(amount > 0, MoralityError::NoBalance);

    balance.amount = 0;

    // Transfer lamports from balance PDA to owner
    **balance.to_account_info().try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += amount;

    Ok(())
}

// ── Claim Escrow ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ClaimEscrow<'info> {
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        mut,
        seeds = [b"escrow", &entity.entity_hash],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init_if_needed,
        payer = owner,
        space = TipBalance::SIZE,
        seeds = [b"balance", owner.key().as_ref()],
        bump,
    )]
    pub balance: Account<'info, TipBalance>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn claim_escrow(ctx: Context<ClaimEscrow>) -> Result<()> {
    let entity = &ctx.accounts.entity;
    require!(
        entity.claimed_owner == ctx.accounts.owner.key(),
        MoralityError::NotOwner
    );

    let escrow = &mut ctx.accounts.escrow;
    let amount = escrow.amount;
    require!(amount > 0, MoralityError::NoEscrow);

    escrow.amount = 0;

    // Move from escrow to balance
    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.owner.key();
    balance.amount += amount;
    balance.total_received += amount;
    balance.bump = ctx.bumps.balance;

    // Transfer lamports
    **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
    **balance.to_account_info().try_borrow_mut_lamports()? += amount;

    Ok(())
}
