-- ETH entitlements from the legacy custodial wallets.
--
-- 12 of the 388 old morality.network wallets hold ETH — 0.25282176 ETH in
-- total, all on Ethereum mainnet. Those wallets were created and held BY the
-- platform, so the ETH in them is owed to the user whose account the wallet
-- belonged to.
--
-- This table records the debt. It is deliberately independent of whether the
-- funds have been recovered yet: the legacy keys are AES-encrypted and the
-- passphrase is not currently in hand, so the entitlement is recorded now and
-- settled whenever the sweep becomes possible.
--
-- Settlement is a payout to the user's OWN self-custody wallet
-- (pooter.account_wallets), never back into a platform-held address.

CREATE TABLE IF NOT EXISTS pooter.eth_claims (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id      BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  legacy_address  TEXT NOT NULL,               -- the old custodial wallet the ETH sits in
  amount_wei      NUMERIC(78, 0) NOT NULL,     -- exact wei; never store ETH as a float
  observed_at     TIMESTAMPTZ NOT NULL,        -- when the chain was read
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'recovered', 'paid', 'void')),
  -- 'pending'   entitlement recorded, funds still in the legacy wallet
  -- 'recovered' swept into the treasury, not yet paid out
  -- 'paid'      sent to the user's self-custody wallet
  paid_to_address TEXT,
  paid_tx_hash    TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per legacy wallet.
CREATE UNIQUE INDEX IF NOT EXISTS eth_claims_legacy_address_idx
  ON pooter.eth_claims (LOWER(legacy_address));

CREATE INDEX IF NOT EXISTS eth_claims_account_idx
  ON pooter.eth_claims (account_id);
CREATE INDEX IF NOT EXISTS eth_claims_status_idx
  ON pooter.eth_claims (status);

-- A paid claim must say where it went.
ALTER TABLE pooter.eth_claims DROP CONSTRAINT IF EXISTS eth_claims_paid_complete;
ALTER TABLE pooter.eth_claims ADD CONSTRAINT eth_claims_paid_complete
  CHECK (
    status <> 'paid'
    OR (paid_to_address IS NOT NULL AND paid_tx_hash IS NOT NULL AND paid_at IS NOT NULL)
  );
