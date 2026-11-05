-- Claim Ledger — hardware manufacturers (new entity kind) + security/privacy.
--
-- The ledger so far only records UK MPs, keyed on member_id. This adds the
-- smallest thing that lets it record what a hardware manufacturer published
-- about privacy/security, and check it against a documented outcome, through
-- the SAME pipeline: ledger_claims → ledger_resolutions (proposed) → review
-- queue / staked rounds → published; right of reply via ledger_disputes;
-- calibration via score.ts (n≥20 display gate unchanged).
--
-- What's new:
--   1. pooter.ledger_entities — non-MP entities. Only kind 'manufacturer'.
--   2. ledger_claims.entity_id — who a non-MP claim is attributed to.
--   3. ledger_claims.review_hold — a held claim is NOT public anywhere. Every
--      manufacturer claim must start held (enforced below) and is released
--      only when a resolution on it is published WITH a reviewer identity
--      (enforced by trigger). MP claims are unaffected (default FALSE).
--   4. New vocabulary (TEXT columns, no CHECKs to alter): context
--      'company-statement', topic 'security-privacy', source_kind
--      'company-statement', evidence kinds 'regulator' and 'company'.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).

CREATE TABLE IF NOT EXISTS pooter.ledger_entities (
  id          TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  kind        TEXT NOT NULL CHECK (kind IN ('manufacturer')),
  name        TEXT NOT NULL,                     -- display name, e.g. 'Ledger'
  legal_name  TEXT,                              -- as stated in a primary source
  country     TEXT,
  website     TEXT,
  products    TEXT[] NOT NULL DEFAULT '{}',      -- product lines the claims concern
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pooter.ledger_claims
  ADD COLUMN IF NOT EXISTS entity_id   TEXT REFERENCES pooter.ledger_entities(id),
  ADD COLUMN IF NOT EXISTS review_hold BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ledger_claims_entity_idx
  ON pooter.ledger_claims (entity_id) WHERE entity_id IS NOT NULL;

-- A claim belongs to an MP or an entity, never both.
ALTER TABLE pooter.ledger_claims DROP CONSTRAINT IF EXISTS ledger_claims_one_subject;
ALTER TABLE pooter.ledger_claims ADD CONSTRAINT ledger_claims_one_subject
  CHECK (entity_id IS NULL OR member_id IS NULL);

-- An entity claim can only be un-held once it has been resolved through
-- review. (The release itself happens in the trigger below.)
ALTER TABLE pooter.ledger_claims DROP CONSTRAINT IF EXISTS ledger_claims_entity_held_until_reviewed;
ALTER TABLE pooter.ledger_claims ADD CONSTRAINT ledger_claims_entity_held_until_reviewed
  CHECK (entity_id IS NULL OR review_hold OR status = 'resolved');

-- Release gate. Both publish paths (approveResolution and a settled staked
-- round) end in ledger_resolutions.status = 'published'; this trigger:
--   * refuses to publish ANY verdict (including 'unresolved', which
--     migration 003 lets through unreviewed) on an entity claim without a
--     reviewer identity, and
--   * releases the claim from hold and marks it resolved.
CREATE OR REPLACE FUNCTION pooter.ledger_release_held_claim() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  claim_entity TEXT;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  SELECT entity_id INTO claim_entity FROM pooter.ledger_claims WHERE id = NEW.claim_id;
  IF claim_entity IS NOT NULL AND NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'ledger: entity claim % cannot publish without a reviewer', NEW.claim_id;
  END IF;
  UPDATE pooter.ledger_claims
     SET review_hold = FALSE, status = 'resolved'
   WHERE id = NEW.claim_id AND review_hold;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_release_held_claim ON pooter.ledger_resolutions;
CREATE TRIGGER ledger_release_held_claim
  AFTER INSERT OR UPDATE OF status ON pooter.ledger_resolutions
  FOR EACH ROW EXECUTE FUNCTION pooter.ledger_release_held_claim();

-- ── Seed: hardware manufacturers (review-queue entries, NOT published) ─────
--
-- Five claim/outcome pairs, each checked against the primary source on
-- 2026-11-05. Every claim is inserted with review_hold = TRUE and every
-- verdict with status = 'proposed': nothing here is public until a reviewer
-- publishes it through the review queue (the trigger above enforces that).
--
-- Quotes are exact substrings of the claim source. Where the company's own
-- page could not be retrieved, the quote is the company's wording AS QUOTED
-- IN a regulator's complaint, and the complaint is the source_url
-- (extracted_by.quoted_in says so). FTC matters were settled without
-- admission; the reasoning says so on every one.
--
-- Ids: claim = first 32 hex of sha256('maker:<entity>:<slug>');
--      resolution = first 32 hex of sha256('maker-resolution:<entity>:<slug>').

INSERT INTO pooter.ledger_entities (id, kind, name, legal_name, website, products) VALUES
  ('ledger', 'manufacturer', 'Ledger', NULL,                     'https://www.ledger.com', ARRAY['Ledger Nano X', 'Ledger Recover', 'ledger.com e-commerce']),
  ('vizio',  'manufacturer', 'VIZIO',  'VIZIO, Inc.',            'https://www.vizio.com',  ARRAY['Smart TVs (ACR)']),
  ('ring',   'manufacturer', 'Ring',   'Ring LLC',               'https://ring.com',       ARRAY['Ring Stick Up Cam']),
  ('asus',   'manufacturer', 'ASUS',   'ASUSTeK Computer Inc.',  'https://www.asus.com',   ARRAY['Routers (AiCloud)'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO pooter.ledger_claims (
  id, member_id, entity_id, review_hold, speaker_name, party, constituency,
  verbatim_quote, normalized_claim, claim_type, topic, resolution_due,
  source_kind, source_url, contribution_ext_id, debate_ext_id,
  uttered_at, context, extracted_by
)
SELECT left(encode(sha256(convert_to('maker:' || v.entity_id || ':' || v.slug, 'UTF8')), 'hex'), 32),
       NULL, v.entity_id, TRUE, v.speaker_name, NULL, NULL,
       v.quote, v.normalized, 'retrodictable', 'security-privacy', NULL,
       'company-statement', v.source_url,
       'maker:' || v.entity_id || ':' || v.slug, 'maker:' || v.entity_id,
       v.uttered_at::date, 'company-statement', v.extracted_by::jsonb
FROM (VALUES
  ('ledger', '2020-breach-scope', 'Ledger',
   'Further to investigating the situation we have also been able to establish that, for a subset of 9500 customers were also exposed, such as first and last name, postal address, phone number or ordered products.',
   'In its 29 July 2020 breach notice, Ledger stated that detailed personal information (name, postal address, phone number or ordered products) was exposed for a subset of about 9,500 customers, in addition to about 1 million email addresses.',
   'https://www.ledger.com/addressing-the-july-2020-e-commerce-and-marketing-data-breach',
   '2020-07-29',
   '{"provider":"manual","model":"curated","version":"hardware-makers-v1","date_precision":"day"}'),
  ('ledger', 'nano-x-seed-never-leaves-se', 'Ledger',
   'The secret keys or seed are never exposed to the BLE stack and never, ever leave the Secure Element.',
   'Ledger stated, in describing the Nano X Bluetooth security model, that the device''s secret keys or seed never leave the Secure Element.',
   'https://www.ledger.com/ledger-nano-x-bluetooth-security-model-of-a-wireless-hardware-wallet',
   '2019-01-15',
   '{"provider":"manual","model":"curated","version":"hardware-makers-v1","date_precision":"day","context_note":"statement made about the Bluetooth (BLE) transport"}'),
  ('vizio', 'smart-interactivity-description', 'VIZIO',
   'Enables program offers and suggestions.',
   'VIZIO described the "Smart Interactivity" setting on its ACR-enabled televisions as enabling program offers and suggestions; the description did not mention collection of viewing data.',
   'https://www.ftc.gov/system/files/documents/cases/170206_vizio_2017.02.06_complaint.pdf',
   '2014-02-01',
   '{"provider":"manual","model":"curated","version":"hardware-makers-v1","date_precision":"month","quoted_in":"FTC/New Jersey complaint, 6 Feb 2017, para. 22","date_note":"setting existed on ACR-enabled sets; complaint dates ACR tracking from February 2014"}'),
  ('ring', 'stick-up-cam-security', 'Ring',
   '[a]dd security anywhere you need it',
   'Ring marketed the Ring Stick Up Cam as a product that lets users add security in their home.',
   'https://www.ftc.gov/system/files/ftc_gov/pdf/complaint_ring.pdf',
   '2016-01-01',
   '{"provider":"manual","model":"curated","version":"hardware-makers-v1","date_precision":"month","quoted_in":"FTC complaint, May 2023, para. 9","date_note":"complaint: since January 2016"}'),
  ('asus', 'aicloud-increased-privacy', 'ASUS',
   'private personal cloud for selective file sharing',
   'ASUS marketed the AiCloud router feature as a private personal cloud for selective file sharing, featuring "indefinite storage and increased privacy".',
   'https://www.ftc.gov/system/files/documents/cases/160222asuscmpt.pdf',
   '2012-08-01',
   '{"provider":"manual","model":"curated","version":"hardware-makers-v1","date_precision":"month","quoted_in":"FTC complaint, 22 Feb 2016, para. 7","date_note":"complaint: introduced and marketed from August 2012"}')
) AS v(entity_id, slug, speaker_name, quote, normalized, source_url, uttered_at, extracted_by)
ON CONFLICT (id) DO NOTHING;

-- Proposed verdicts. resolved_by marks these as curated proposals from this
-- seed, not a human sign-off; publication needs a reviewer (trigger above).
INSERT INTO pooter.ledger_resolutions (
  id, claim_id, verdict, evidence, reasoning, resolved_by, status
)
SELECT left(encode(sha256(convert_to('maker-resolution:' || v.entity_id || ':' || v.slug, 'UTF8')), 'hex'), 32),
       left(encode(sha256(convert_to('maker:' || v.entity_id || ':' || v.slug, 'UTF8')), 'hex'), 32),
       v.verdict, v.evidence::jsonb, v.reasoning,
       'agent:curated/hardware-makers-seed@v1', 'proposed'
FROM (VALUES
  ('ledger', '2020-breach-scope', 'false',
   '[{"url":"https://www.ledger.com/message-ledgers-ceo-data-leak","kind":"company","excerpt":"Ledger CEO update, 21 Dec 2020: \"a larger subset of detailed information has been leaked, approximately 272,000 detailed information such as postal address, last name, first name and telephone number\"; the July analysis had identified \"9,532 more detailed personal information\"."}]',
   'Ledger''s own 21 Dec 2020 update puts the number of customers whose detailed personal information leaked at about 272,000, against about 9,500 stated on 29 July 2020. The update says: "These details are not available in the logs that we were able to analyse." The July statement that payment information and crypto funds were safe is not contradicted by this source and is not part of this claim.'),
  ('ledger', 'nano-x-seed-never-leaves-se', 'partial',
   '[{"url":"https://shop.ledger.com/pages/ledger-recover","kind":"company","excerpt":"Ledger Recover (undated product page): \"a pre-BIP39 version of your private key is encrypted, duplicated and divided into three fragments\", \"with each fragment secured by a separate company—Coincover, Ledger and EscrowTech\"."},{"url":"https://www.ledger.com/blog/announcing-the-ledger-recover-cryptographic-protocol-white-paper","kind":"company","excerpt":"Ledger, 21 Jun 2023: Recover is \"an entirely optional and opt-in paid subscription service that does not impact the security of your Ledger.\""},{"url":"https://www.ledger.com/blog/part-1-genesis-of-ledger-recover-self-custody-without-compromise","kind":"company","excerpt":"Ledger, 25 Jul 2023: \"the share computation is entirely done inside the Secure Element, under the strict control of the user pin code.\""}]',
   'Ledger''s own Recover pages say that, for users who subscribe, an encrypted version of the private key is split inside the Secure Element and the fragments are held by three companies, two of which can send fragments back to rebuild the key. The seed is not exported in clear, the feature is opt-in and paid, and the 2019 statement was made about the Bluetooth transport. Proposed as partial for the reviewer to weigh; earliest primary Ledger date verified for Recover is 21 Jun 2023.'),
  ('vizio', 'smart-interactivity-description', 'false',
   '[{"url":"https://www.ftc.gov/system/files/documents/cases/170206_vizio_2017.02.06_complaint.pdf","kind":"regulator","excerpt":"FTC/New Jersey complaint, para. 22: \"Neither description provided information about the collection of viewing data. Defendants have not provided any \"program offers or suggestions\" or \"program-related information\" for most televisions for more than two years\"."},{"url":"https://www.ftc.gov/news-events/news/press-releases/2017/02/vizio-pay-22-million-ftc-state-new-jersey-settle-charges-it-collected-viewing-histories-11-million","kind":"regulator","excerpt":"FTC, 6 Feb 2017: VIZIO agreed to pay $2.2 million to settle charges that it collected viewing data on 11 million consumer TVs without consumers'' knowledge or consent."}]',
   'These are allegations in an FTC/New Jersey complaint, settled by stipulated order in which the defendants "neither admit nor deny any of the allegations in the Complaint". The complaint alleges the setting description omitted viewing-data collection and that the described offers were not provided on most televisions for more than two years.'),
  ('ring', 'stick-up-cam-security', 'partial',
   '[{"url":"https://www.ftc.gov/system/files/ftc_gov/pdf/complaint_ring.pdf","kind":"regulator","excerpt":"FTC complaint, para. 13: before September 2017 \"Ring gave every employee—as well as hundreds of Ukraine-based third-party contractors—full access to every customer video\"; para. 17: between June and August 2017 an employee \"viewed thousands of video recordings belonging to at least 81 unique female users\"."},{"url":"https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users","kind":"regulator","excerpt":"FTC, 31 May 2023: the proposed order requires Ring to pay $5.8 million, used for consumer refunds."}]',
   'These are allegations in an FTC complaint, resolved by a stipulated order in which Ring "neither admits nor denies any of the allegations in the Complaint". The quoted marketing is a general security claim rather than an explicit privacy promise, so this is proposed as partial for the reviewer to weigh.'),
  ('asus', 'aicloud-increased-privacy', 'false',
   '[{"url":"https://www.ftc.gov/system/files/documents/cases/160222asuscmpt.pdf","kind":"regulator","excerpt":"FTC complaint, 22 Feb 2016: exploiting AiCloud vulnerabilities and AiDisk design flaws, hackers \"gained unauthorized access to the attached USB storage devices of thousands of consumers\"."},{"url":"https://www.ftc.gov/news-events/news/press-releases/2016/02/asus-settles-ftc-charges-insecure-home-routers-cloud-services-put-consumers-privacy-risk","kind":"regulator","excerpt":"FTC, 23 Feb 2016: ASUS settled FTC charges that insecure home routers and cloud services put consumers'' privacy at risk."}]',
   'These are allegations in an FTC complaint, resolved by consent agreement in which ASUS "neither admits nor denies any of the allegations". The complaint alleges AiCloud vulnerabilities allowed unauthorized access to consumers'' connected storage.')
) AS v(entity_id, slug, verdict, evidence, reasoning)
WHERE EXISTS (
  SELECT 1 FROM pooter.ledger_claims c
  WHERE c.id = left(encode(sha256(convert_to('maker:' || v.entity_id || ':' || v.slug, 'UTF8')), 'hex'), 32)
)
ON CONFLICT DO NOTHING;
