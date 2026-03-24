use anchor_lang::prelude::*;

#[error_code]
pub enum MoralityError {
    #[msg("Entity already exists")]
    EntityAlreadyExists,
    #[msg("Entity does not exist")]
    EntityNotFound,
    #[msg("Invalid entity type (must be 0-3)")]
    InvalidEntityType,
    #[msg("Identifier too long (max 200 chars)")]
    IdentifierTooLong,
    #[msg("Entity already has a claimed owner")]
    AlreadyClaimed,
    #[msg("Claim not approved for this wallet")]
    ClaimNotApproved,
    #[msg("Not authorized to edit this entity")]
    NotAuthorized,
    #[msg("Claim text required")]
    ClaimRequired,
    #[msg("Claim text too long (max 500 chars)")]
    ClaimTooLong,
    #[msg("Score must be 1-5")]
    InvalidScore,
    #[msg("Reason too long (max 500 chars)")]
    ReasonTooLong,
    #[msg("Interpretation dimensions must be 0-100")]
    InvalidDimension,
    #[msg("Comment content required")]
    EmptyComment,
    #[msg("Comment too long (max 2000 chars)")]
    CommentTooLong,
    #[msg("Vote must be +1 or -1")]
    InvalidVote,
    #[msg("Cannot vote on your own comment")]
    SelfVote,
    #[msg("Comment does not exist")]
    CommentNotFound,
    #[msg("Parent comment does not exist")]
    ParentNotFound,
    #[msg("Must send SOL")]
    ZeroTip,
    #[msg("Cannot tip yourself")]
    SelfTip,
    #[msg("No balance to withdraw")]
    NoBalance,
    #[msg("No escrowed funds")]
    NoEscrow,
    #[msg("Not the entity owner")]
    NotOwner,
    #[msg("AI score must be 0-10000")]
    InvalidAIScore,
    #[msg("Not the AI oracle")]
    NotOracle,
    #[msg("Protocol is paused")]
    Paused,
    #[msg("AI oracle not configured")]
    OracleNotSet,
    #[msg("AI score update too frequent (5min cooldown)")]
    TooFrequent,
    #[msg("Comment ID overflow")]
    CommentIdOverflow,
}
