use anchor_lang::prelude::*;

// ── Registry Events ───────────────────────────────────────────────────

#[event]
pub struct EntityRegistered {
    pub entity_hash: [u8; 32],
    pub entity_type: u8,
    pub identifier: String,
    pub registered_by: Pubkey,
}

#[event]
pub struct OwnershipClaimed {
    pub entity_hash: [u8; 32],
    pub claimed_owner: Pubkey,
}

#[event]
pub struct OwnershipClaimApproved {
    pub entity_hash: [u8; 32],
    pub claimer: Pubkey,
}

#[event]
pub struct CanonicalClaimSet {
    pub entity_hash: [u8; 32],
    pub claim_hash: [u8; 32],
    pub set_by: Pubkey,
    pub version: u64,
}

// ── Ratings Events ────────────────────────────────────────────────────

#[event]
pub struct Rated {
    pub entity_hash: [u8; 32],
    pub rater: Pubkey,
    pub score: u8,
    pub is_update: bool,
}

#[event]
pub struct RatedWithReason {
    pub entity_hash: [u8; 32],
    pub rater: Pubkey,
    pub score: u8,
    pub reason: String,
    pub is_update: bool,
}

#[event]
pub struct InterpretationRated {
    pub entity_hash: [u8; 32],
    pub rater: Pubkey,
    pub truth: u8,
    pub importance: u8,
    pub moral_impact: u8,
    pub is_update: bool,
}

// ── Comments Events ───────────────────────────────────────────────────

#[event]
pub struct CommentCreated {
    pub comment_id: u64,
    pub entity_hash: [u8; 32],
    pub author: Pubkey,
    pub parent_id: u64,
}

#[event]
pub struct CommentVoted {
    pub comment_id: u64,
    pub voter: Pubkey,
    pub vote: i8,
}

// ── Tipping Events ────────────────────────────────────────────────────

#[event]
pub struct EntityTipped {
    pub entity_hash: [u8; 32],
    pub tipper: Pubkey,
    pub amount: u64,
    pub is_escrowed: bool,
}

#[event]
pub struct CommentTipped {
    pub comment_id: u64,
    pub entity_hash: [u8; 32],
    pub tipper: Pubkey,
    pub author: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TipsWithdrawn {
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowClaimed {
    pub entity_hash: [u8; 32],
    pub owner: Pubkey,
    pub amount: u64,
}

// ── Leaderboard Events ────────────────────────────────────────────────

#[event]
pub struct AIScoreUpdated {
    pub entity_hash: [u8; 32],
    pub score: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleUpdated {
    pub old_oracle: Pubkey,
    pub new_oracle: Pubkey,
}
