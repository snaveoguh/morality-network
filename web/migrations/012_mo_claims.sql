-- MO onchain claim epochs + per-account Merkle leaves.
--
-- Each epoch is a frozen snapshot of pooter.mo_ledger balances joined to each
-- account's PRIMARY linked wallet (pooter.account_wallets), published as a
-- Merkle root on the MoClaimDistributor contract on Base. Proofs are stored
-- here so /api/account/claim-proof can serve the signed-in user theirs.
--
-- Ledger discipline: when a claim is observed onchain, a NEGATIVE mo_ledger
-- row (reason 'onchain_claim', ref 'tx:<hash>') is appended so platform and
-- onchain balances never double-count. Because later epochs snapshot live
-- balances, the previous epoch's root MUST be retired on the contract in the
-- same Safe batch that publishes a new one.

CREATE TABLE IF NOT EXISTS pooter.mo_claim_epochs (
  epoch        BIGINT PRIMARY KEY,
  root         TEXT NOT NULL,                -- 0x… Merkle root (OZ standard tree)
  total_wei    NUMERIC(78, 0) NOT NULL,      -- sum of all leaf amounts
  leaf_count   INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pooter.mo_claim_leaves (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epoch        BIGINT NOT NULL REFERENCES pooter.mo_claim_epochs (epoch) ON DELETE CASCADE,
  leaf_index   INTEGER NOT NULL,
  account_id   BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  address      TEXT NOT NULL,                -- the primary wallet at snapshot time
  amount_wei   NUMERIC(78, 0) NOT NULL,      -- MO in 18-decimal wei
  proof        JSONB NOT NULL,               -- array of 0x… sibling hashes
  claimed_tx   TEXT,                         -- set when the Claimed event is verified
  claimed_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS mo_claim_leaves_epoch_idx
  ON pooter.mo_claim_leaves (epoch, leaf_index);

-- One leaf per account per epoch.
CREATE UNIQUE INDEX IF NOT EXISTS mo_claim_leaves_account_epoch_idx
  ON pooter.mo_claim_leaves (epoch, account_id);

CREATE INDEX IF NOT EXISTS mo_claim_leaves_account_idx
  ON pooter.mo_claim_leaves (account_id, epoch DESC);
