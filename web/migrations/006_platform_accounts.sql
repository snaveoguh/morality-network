-- Platform accounts + MO balances.
--
-- Seeded from the two morality.network exports (see
-- scripts/build-legacy-ledger.mjs). 401 accounts, 194 of them funded,
-- 2,814,063.93910905 MO of opening supply.
--
-- Deliberately NON-CUSTODIAL. The legacy exports carry an EncryptedPrivateKey
-- and Salt per account; none of that material is stored here and none of it
-- should ever be imported. Login is a signed-in-by-email magic link, and MO is
-- a platform-side balance until the token redeploys.
--
-- Balances are an append-only ledger rather than a mutable column: every
-- credit and debit leaves a row, and the balance is the sum. Same discipline
-- as the Claim Ledger — the history cannot be quietly rewritten.

CREATE TABLE IF NOT EXISTS pooter.accounts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,        -- always stored lowercased
  display_name       TEXT,
  legacy_address     TEXT,                        -- old custodial wallet, for reference only
  legacy_source      TEXT,                        -- 'balance_sheet_2021' | 'account_profiles_2024'
  legacy_mainnet_mo  NUMERIC(38, 8) NOT NULL DEFAULT 0,  -- MO the user already withdrew to mainnet; NOT credited
  legacy_eth         NUMERIC(38, 18) NOT NULL DEFAULT 0, -- ETH stranded on the old custodial wallet
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS accounts_legacy_address_idx
  ON pooter.accounts (legacy_address);

-- ── MO ledger ──────────────────────────────────────────────────────────────
-- Append-only. Balance = SUM(delta) per account. Never UPDATE or DELETE.
CREATE TABLE IF NOT EXISTS pooter.mo_ledger (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  delta       NUMERIC(38, 8) NOT NULL,     -- positive = credit, negative = debit
  reason      TEXT NOT NULL,               -- 'legacy_migration' | 'award' | 'spend' | ...
  ref         TEXT,                        -- idempotency / provenance key
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mo_ledger_account_idx
  ON pooter.mo_ledger (account_id, created_at DESC);

-- One legacy migration entry per account, ever. Makes the seed re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS mo_ledger_legacy_once_idx
  ON pooter.mo_ledger (account_id)
  WHERE reason = 'legacy_migration';

-- ── Magic-link login tokens ────────────────────────────────────────────────
-- Only the SHA-256 of the token is stored, so a database leak does not hand
-- anyone a working login link.
CREATE TABLE IF NOT EXISTS pooter.login_tokens (
  token_hash  TEXT PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_tokens_account_idx
  ON pooter.login_tokens (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_tokens_expiry_idx
  ON pooter.login_tokens (expires_at);

-- ── Balance view ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW pooter.mo_balances AS
SELECT
  a.id                                          AS account_id,
  a.email,
  COALESCE(SUM(l.delta), 0)::NUMERIC(38, 8)     AS balance_mo,
  a.legacy_mainnet_mo,
  a.legacy_address,
  MAX(l.created_at)                             AS last_movement_at
FROM pooter.accounts a
LEFT JOIN pooter.mo_ledger l ON l.account_id = a.id
GROUP BY a.id, a.email, a.legacy_mainnet_mo, a.legacy_address;

-- scripts/migrate.js records this file in pooter.schema_migrations itself —
-- do not self-record here.
