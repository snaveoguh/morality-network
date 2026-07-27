-- Self-custody wallets linked to platform accounts.
--
-- Users generate a wallet IN THE BROWSER (viem, BIP-39) and the key never
-- leaves their device. All we ever store is the public address plus proof
-- that they controlled it at link time. This is the deliberate opposite of
-- the legacy morality.network model, where the platform generated and held
-- every user's key.
--
-- A single account may link more than one address over time (lost phone,
-- upgraded to a hardware wallet), so this is a table rather than a column.
-- Exactly one linked wallet per account is primary — that's the one the MO
-- claim will pay out to when the token redeploys.

CREATE TABLE IF NOT EXISTS pooter.account_wallets (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  address      TEXT NOT NULL,              -- EIP-55 checksummed
  is_primary   BOOLEAN NOT NULL DEFAULT TRUE,
  origin       TEXT NOT NULL,              -- 'generated' (in-browser) | 'connected' (existing wallet)
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Proof of control, kept so a payout can be audited after the fact.
  proof_message   TEXT NOT NULL,
  proof_signature TEXT NOT NULL
);

-- An address may only ever belong to one account — otherwise two accounts
-- could both claim a payout to the same wallet.
CREATE UNIQUE INDEX IF NOT EXISTS account_wallets_address_idx
  ON pooter.account_wallets (LOWER(address));

CREATE INDEX IF NOT EXISTS account_wallets_account_idx
  ON pooter.account_wallets (account_id, linked_at DESC);

-- At most one primary wallet per account.
CREATE UNIQUE INDEX IF NOT EXISTS account_wallets_one_primary_idx
  ON pooter.account_wallets (account_id)
  WHERE is_primary;

-- ── Link nonces ────────────────────────────────────────────────────────────
-- Single-use, short-lived challenge strings. Signing a fixed message would let
-- a signature captured anywhere else be replayed here.
CREATE TABLE IF NOT EXISTS pooter.wallet_link_nonces (
  nonce       TEXT PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_link_nonces_account_idx
  ON pooter.wallet_link_nonces (account_id, created_at DESC);
