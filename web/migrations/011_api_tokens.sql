-- Bearer API tokens — identity contract v1.
--
-- Personal access tokens for cookieless clients (browser extension, mobile).
-- A token is minted by POST /api/auth/token, either from a SIWE proof or from
-- an already-authenticated session, and presented as
-- `Authorization: Bearer pat_...`.
--
-- Only the SHA-256 of the token is stored — a database leak yields nothing
-- usable, same rule as pooter.login_tokens (006). Either subject column may be
-- null, but never both: a token belongs to a platform account, a wallet
-- address, or (when a SIWE login maps onto a linked wallet) both at once.

CREATE TABLE IF NOT EXISTS pooter.api_tokens (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id    BIGINT REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  address       TEXT,                          -- EIP-55 checksummed, when SIWE-minted
  token_hash    TEXT NOT NULL UNIQUE,          -- sha256 hex of the raw pat_ token
  scopes        TEXT[] NOT NULL DEFAULT '{}',  -- '{*}' = full access
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ,
  CONSTRAINT api_tokens_subject_check CHECK (account_id IS NOT NULL OR address IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS api_tokens_account_idx
  ON pooter.api_tokens (account_id, created_at DESC);

-- Expired rows are dead weight; make the sweep cheap.
CREATE INDEX IF NOT EXISTS api_tokens_expires_idx
  ON pooter.api_tokens (expires_at);
