use anchor_lang::prelude::*;

/// Global protocol config — PDA seed: ["config"]
#[account]
pub struct Config {
    pub authority: Pubkey,       // Protocol owner
    pub ai_oracle: Pubkey,       // AI score oracle
    pub entity_count: u64,       // Total registered entities
    pub next_comment_id: u64,    // Auto-incrementing comment ID
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1; // discriminator + fields
}

/// Entity — PDA seed: ["entity", entity_hash]
#[account]
pub struct Entity {
    pub entity_hash: [u8; 32],   // keccak256 of identifier
    pub entity_type: u8,         // 0=URL, 1=DOMAIN, 2=ADDRESS, 3=CONTRACT
    pub identifier: String,      // The raw identifier (max 200 chars)
    pub registered_by: Pubkey,
    pub claimed_owner: Pubkey,   // Pubkey::default() if unclaimed
    pub approved_claimant: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl Entity {
    // 8 (disc) + 32 + 1 + 4+200 + 32 + 32 + 32 + 8 + 1 = 350
    pub const SIZE: usize = 8 + 32 + 1 + (4 + 200) + 32 + 32 + 32 + 8 + 1;
}

/// Canonical claim for an entity — PDA seed: ["claim", entity_hash]
#[account]
pub struct CanonicalClaim {
    pub entity_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub text: String,            // max 500 chars
    pub set_by: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: u64,
    pub bump: u8,
}

impl CanonicalClaim {
    pub const SIZE: usize = 8 + 32 + 32 + (4 + 500) + 32 + 8 + 8 + 8 + 1;
}

/// Per-entity rating stats — PDA seed: ["rating_stats", entity_hash]
#[account]
pub struct RatingStats {
    pub entity_hash: [u8; 32],
    pub total_score: u64,
    pub rating_count: u64,
    pub last_updated: i64,
    // Interpretation aggregates
    pub total_truth: u64,
    pub total_importance: u64,
    pub total_moral_impact: u64,
    pub interpretation_count: u64,
    pub bump: u8,
}

impl RatingStats {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}

/// Per-user rating on an entity — PDA seed: ["user_rating", entity_hash, rater]
#[account]
pub struct UserRating {
    pub entity_hash: [u8; 32],
    pub rater: Pubkey,
    pub score: u8,               // 1-5
    pub reason: String,          // max 500 chars (empty if no reason)
    pub timestamp: i64,
    // Interpretation dimensions (0 if not set)
    pub truth: u8,
    pub importance: u8,
    pub moral_impact: u8,
    pub has_interpretation: bool,
    pub bump: u8,
}

impl UserRating {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + (4 + 500) + 8 + 1 + 1 + 1 + 1 + 1;
}

/// Comment — PDA seed: ["comment", comment_id.to_le_bytes()]
#[account]
pub struct Comment {
    pub id: u64,
    pub entity_hash: [u8; 32],
    pub author: Pubkey,
    pub content: String,         // max 2000 chars
    pub parent_id: u64,          // 0 = top-level
    pub score: i64,              // upvotes - downvotes
    pub tip_total: u64,          // SOL lamports
    pub timestamp: i64,
    pub bump: u8,
}

impl Comment {
    pub const SIZE: usize = 8 + 8 + 32 + 32 + (4 + 2000) + 8 + 8 + 8 + 8 + 1;
}

/// Per-user vote on a comment — PDA seed: ["vote", comment_id.to_le_bytes(), voter]
#[account]
pub struct Vote {
    pub comment_id: u64,
    pub voter: Pubkey,
    pub value: i8,               // +1 or -1
    pub bump: u8,
}

impl Vote {
    pub const SIZE: usize = 8 + 8 + 32 + 1 + 1;
}

/// Tip balance for an address — PDA seed: ["balance", owner]
#[account]
pub struct TipBalance {
    pub owner: Pubkey,
    pub amount: u64,             // Withdrawable lamports
    pub total_received: u64,
    pub total_given: u64,
    pub bump: u8,
}

impl TipBalance {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1;
}

/// Escrow for unclaimed entity tips — PDA seed: ["escrow", entity_hash]
#[account]
pub struct Escrow {
    pub entity_hash: [u8; 32],
    pub amount: u64,
    pub bump: u8,
}

impl Escrow {
    pub const SIZE: usize = 8 + 32 + 8 + 1;
}

/// AI score for an entity — PDA seed: ["ai_score", entity_hash]
#[account]
pub struct AIScore {
    pub entity_hash: [u8; 32],
    pub score: u64,              // 0-10000 (0.00-100.00)
    pub updated_at: i64,
    pub bump: u8,
}

impl AIScore {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1;
}
