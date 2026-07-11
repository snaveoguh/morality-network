-- Claim Ledger — Phase C: daily Merkle batches (tamper evidence).
-- One root per day over that day's recorded claims. tx_hash stays NULL until
-- the LedgerAnchor contract is deployed and the anchor wallet configured;
-- roots computed now are anchorable retroactively.

CREATE TABLE IF NOT EXISTS pooter.ledger_merkle_batches (
  day          DATE PRIMARY KEY,
  root         TEXT NOT NULL,             -- 0x-prefixed sha256 merkle root
  claim_count  INTEGER NOT NULL,
  tx_hash      TEXT,                      -- Base L2 anchor tx, when sent
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
