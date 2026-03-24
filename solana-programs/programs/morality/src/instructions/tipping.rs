use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::errors::MoralityError;
use crate::events;

// ── Tip Entity ────────────────────────────────────────────────────────
// FIX C-3: Conditionally route SOL to owner_balance or escrow based on claim status.
// FIX H-1: owner_balance uses separate "tip_vault" seed to avoid collision with tipper_balance.
// FIX H-4: Check tipper != claimed_owner to prevent self-tip PDA collision.

#[derive(Accounts)]
pub struct TipEntity<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    /// Vault PDA that holds actual SOL for tips. All tip lamports go here.
    /// Seed: ["vault", entity_hash] — one vault per entity, holds all SOL.
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipVault::SIZE,
        seeds = [b"vault", &entity.entity_hash],
        bump,
    )]
    pub vault: Account<'info, TipVault>,
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

    let entity = &ctx.accounts.entity;

    // Transfer SOL from tipper to vault PDA (single source of truth for SOL)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.tipper.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Track tipper stats
    let tipper_balance = &mut ctx.accounts.tipper_balance;
    tipper_balance.owner = ctx.accounts.tipper.key();
    tipper_balance.total_given = tipper_balance.total_given.saturating_add(amount);
    tipper_balance.bump = ctx.bumps.tipper_balance;

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.entity_hash = entity.entity_hash;
    vault.total_deposited = vault.total_deposited.saturating_add(amount);
    vault.bump = ctx.bumps.vault;

    let is_escrowed = entity.claimed_owner == Pubkey::default();
    if !is_escrowed {
        vault.owner_claimable = vault.owner_claimable.saturating_add(amount);
    } else {
        vault.escrowed = vault.escrowed.saturating_add(amount);
    }

    emit!(events::EntityTipped {
        entity_hash: entity.entity_hash,
        tipper: ctx.accounts.tipper.key(),
        amount,
        is_escrowed,
    });

    Ok(())
}

// ── Tip Comment ───────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct TipComment<'info> {
    #[account(seeds = [b"config"], bump = config.bump, constraint = !config.paused @ MoralityError::Paused)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"comment", &comment.id.to_le_bytes()],
        bump = comment.bump,
        constraint = comment.author != tipper.key() @ MoralityError::SelfTip,
    )]
    pub comment: Account<'info, Comment>,
    /// Vault for the comment's entity — holds the actual SOL
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipVault::SIZE,
        seeds = [b"vault", &comment.entity_hash],
        bump,
    )]
    pub vault: Account<'info, TipVault>,
    /// Author's balance (for tracking total_received)
    #[account(
        init_if_needed,
        payer = tipper,
        space = TipBalance::SIZE,
        seeds = [b"balance", comment.author.as_ref()],
        bump,
    )]
    pub author_balance: Account<'info, TipBalance>,
    /// Tipper's balance (for tracking total_given)
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

    // Transfer SOL to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.tipper.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update comment tip total
    ctx.accounts.comment.tip_total = ctx.accounts.comment.tip_total.saturating_add(amount);

    // Update vault
    let vault = &mut ctx.accounts.vault;
    vault.entity_hash = ctx.accounts.comment.entity_hash;
    vault.total_deposited = vault.total_deposited.saturating_add(amount);
    vault.owner_claimable = vault.owner_claimable.saturating_add(amount);
    vault.bump = ctx.bumps.vault;

    // Track balances (bookkeeping only — no SOL moves to these PDAs)
    let author_balance = &mut ctx.accounts.author_balance;
    author_balance.owner = ctx.accounts.comment.author;
    author_balance.amount = author_balance.amount.saturating_add(amount);
    author_balance.total_received = author_balance.total_received.saturating_add(amount);
    author_balance.bump = ctx.bumps.author_balance;

    let tipper_balance = &mut ctx.accounts.tipper_balance;
    tipper_balance.owner = ctx.accounts.tipper.key();
    tipper_balance.total_given = tipper_balance.total_given.saturating_add(amount);
    tipper_balance.bump = ctx.bumps.tipper_balance;

    emit!(events::CommentTipped {
        comment_id: ctx.accounts.comment.id,
        entity_hash: ctx.accounts.comment.entity_hash,
        tipper: ctx.accounts.tipper.key(),
        author: ctx.accounts.comment.author,
        amount,
    });

    Ok(())
}

// ── Withdraw Tips ─────────────────────────────────────────────────────
// FIX C-1: Compute rent-exempt minimum before transferring.
// FIX C-2: Withdraw from vault PDA (where SOL actually lives), not balance PDA.

#[derive(Accounts)]
pub struct WithdrawTips<'info> {
    #[account(
        mut,
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
        has_one = owner,
    )]
    pub balance: Account<'info, TipBalance>,
    /// The vault to withdraw from. Caller must specify which entity's vault.
    #[account(mut)]
    pub vault: Account<'info, TipVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_tips(ctx: Context<WithdrawTips>) -> Result<()> {
    let balance = &mut ctx.accounts.balance;
    let amount = balance.amount;
    require!(amount > 0, MoralityError::NoBalance);

    // FIX C-1: Ensure vault retains rent-exempt minimum
    let vault_info = ctx.accounts.vault.to_account_info();
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(vault_info.data_len());
    let available = vault_info
        .lamports()
        .checked_sub(min_balance)
        .ok_or(MoralityError::NoBalance)?;
    let withdraw_amount = std::cmp::min(amount, available);
    require!(withdraw_amount > 0, MoralityError::NoBalance);

    // Update bookkeeping
    balance.amount = balance.amount.saturating_sub(withdraw_amount);

    // Update vault
    let vault = &mut ctx.accounts.vault;
    vault.owner_claimable = vault.owner_claimable.saturating_sub(withdraw_amount);

    // Transfer lamports from vault to owner (safe: we checked rent-exempt)
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= withdraw_amount;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += withdraw_amount;

    emit!(events::TipsWithdrawn {
        owner: ctx.accounts.owner.key(),
        amount: withdraw_amount,
    });

    Ok(())
}

// ── Claim Escrow ──────────────────────────────────────────────────────
// FIX C-1 + C-3: Moves escrowed amount to owner_claimable in the vault.
// No lamport transfer needed — SOL is already in the vault.

#[derive(Accounts)]
pub struct ClaimEscrow<'info> {
    #[account(seeds = [b"entity", &entity.entity_hash], bump = entity.bump)]
    pub entity: Account<'info, Entity>,
    #[account(
        mut,
        seeds = [b"vault", &entity.entity_hash],
        bump = vault.bump,
    )]
    pub vault: Account<'info, TipVault>,
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

    let vault = &mut ctx.accounts.vault;
    let amount = vault.escrowed;
    require!(amount > 0, MoralityError::NoEscrow);

    // Move from escrowed to owner_claimable (SOL stays in vault)
    vault.escrowed = 0;
    vault.owner_claimable = vault.owner_claimable.saturating_add(amount);

    // Update balance bookkeeping
    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.owner.key();
    balance.amount = balance.amount.saturating_add(amount);
    balance.total_received = balance.total_received.saturating_add(amount);
    balance.bump = ctx.bumps.balance;

    emit!(events::EscrowClaimed {
        entity_hash: entity.entity_hash,
        owner: ctx.accounts.owner.key(),
        amount,
    });

    Ok(())
}
