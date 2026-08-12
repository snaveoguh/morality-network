# Security Baseline — pooter.world

> Compiled 2026-08-12 as part of the compliance baseline workstream.
> Secrets are inventoried **by name and location only**. No values appear in
> this document and none should ever be committed anywhere in this repo.

---

## 1. Secrets inventory

Scope: names found by grepping `process.env.*` across `web/src`, plus known
operational key material. "Rotation" is *unknown* unless a policy exists —
today none do, so everything defaults to unknown/needed.

### 1.1 Key material (highest sensitivity — controls funds or signing)

| Name | Where it lives | What it guards | Rotation |
|---|---|---|---|
| `LEDGER_ANCHOR_PRIVATE_KEY` | Prod web service env (Railway `faithful-purpose`) **and** a raw key file on the operator's Mac (`~/.pooter-ledger-anchor.key`) | Operator key `0xd634...2933` for LedgerAnchor on Base — signs daily Merkle-root anchors | **Needed.** Two copies, one on a laptop disk. Move to a secrets manager (Railway sealed var at minimum; 1Password/`age`-encrypted at rest for the local copy), delete the plaintext file, and never commit it |
| `PRIVATE_KEY` | Web service env (used in `web/src/lib` trading/onchain code) | A funded EVM signing key (generic name — audit exactly which wallet this is) | Unknown — the generic name is itself a hazard; rename to something scoped and document the wallet |
| `AGENT_PRIVATE_KEY` | Web/worker service env | Agent onchain signing (Base) | Unknown |
| `AGENT_BRIDGE_PRIVATE_KEY` | Web/worker service env | Signs agent-bridge messages (`web/src/lib/__tests__/bridge-signature.test.ts` idiom) | Unknown |
| `SOLANA_FEE_PAYER_KEY` | Web service env (`web/src/lib/solana-relay.ts`) | Solana fee-payer keypair — pays for relayed txs | Unknown |
| `HYPERLIQUID_ACCOUNT_ADDRESS` (+ HL signing key on the worker) | `pooter-agent-worker` env | Live trading account on Hyperliquid | Unknown — this account holds live capital |
| Mobile seed material (BIP39) | User devices only (Expo SecureStore) — never server-side | User wallets | n/a (user custody) |

### 1.2 Auth & session secrets

| Name | Where it lives | What it guards | Rotation |
|---|---|---|---|
| `SESSION_SECRET` | Prod/dev web service env (`web/src/lib/session.ts`) | iron-session cookie encryption (`morality-session`) — forging it = forging any login | **Needed.** Note: `session.ts` ships a hardcoded dev fallback string; fine locally, but the code should hard-fail in production if `SESSION_SECRET` is unset rather than fall back |
| `CRON_SECRET` | Web service env | Authenticates scheduled-job endpoints | Unknown |
| `INDEXER_WORKER_SECRET` | Web + indexer worker env | Worker → web API calls | Unknown |
| `AGENT_HUB_SECRET` | Web + `heartfelt-flow` env | Agent Hub LLM router access | Unknown |
| `AGENT_BRIDGE_SECRET` | Web/worker env | Agent bridge auth | Unknown |
| `GOD_MODE_SECRET` / `GOD_MODE_ADDRESSES` | Web service env (`web/src/lib/operator-auth.ts`) | Operator override endpoints | **Needed** — this is an admin backdoor by construction; scope and rotate deliberately. `NEXT_PUBLIC_GOD_MODE_ADDRESSES` also exists and is, by Next.js convention, shipped to the client — addresses only, but confirm nothing secret ever moves under a `NEXT_PUBLIC_` name |

### 1.3 Provider API keys

| Name | Where it lives | What it guards | Rotation |
|---|---|---|---|
| `RESEND_API_KEY` | Web service env (`web/src/app/api/newsletter/send/route.ts`; also the magic-link mailer) | Ability to send email as pooter.world | Unknown |
| `DATABASE_URL` | Web + worker env (Railway Postgres, `pooter-indexer` project) | Full DB read/write incl. accounts and the claim ledger | Unknown — rotate via Railway credential reset |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Web + worker env | Position store, signal cache, experiment history | Unknown |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (+ `S3_BUCKET`, `S3_REGION`) | Web service env (`web/src/app/api/upload/route.ts`) | S3 uploads (article images) | Unknown — prefer a scoped IAM user limited to that bucket |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Web service env (`web/src/lib/cloudflare-crawl.ts`) | Cloudflare API (crawl/browser rendering) | Unknown — check the token's scope; account-wide tokens can edit DNS for pooter.world |
| `TALLY_API_KEY`, `NEYNAR_API_KEY`, `LASTFM_API_KEY`, `HELIUS_API_KEY`, `BRAVE_SEARCH_API_KEY`, `CONGRESS_API_KEY`, `AU_API_KEY`, `BANKR_API_KEY`, `VENICE_API_KEY`, `BASESCAN_API_KEY`, `ETHERSCAN_API_KEY`, `INFURA_KEY` | Web/worker env | Third-party data APIs (mostly read-only, low blast radius) | Unknown — low priority |
| LLM provider keys (Groq/Together/Anthropic/OpenAI on `heartfelt-flow`) | Agent Hub env | Paid inference | Unknown |

### 1.4 Non-secret but security-relevant config

`BASE_RPC_URL` and friends, `OPERATOR_ADDRESSES`, `AGENT_BRIDGE_ALLOWED_SIGNERS`,
`GOD_MODE_ADDRESSES`, contract addresses (`NEXT_PUBLIC_*_ADDRESS`). Not secret,
but changing them changes trust boundaries — treat edits as reviewed changes.

---

## 2. Top-10 hardening actions (ranked)

1. **Get `LEDGER_ANCHOR_PRIVATE_KEY` off the laptop.** One plaintext key file
   on a personal Mac is the single worst artefact in the estate. Move to a
   secrets manager, keep only the Railway env copy, delete the file securely.
2. **Fail closed on `SESSION_SECRET`.** Remove the hardcoded dev fallback path
   in production (`web/src/lib/session.ts`) — if the var is unset in prod the
   app must refuse to start, not mint forgeable sessions. Then set a rotation
   policy (rotate on operator change or suspected leak; sessions re-login).
3. **Ship the mobile drainer fix in flight.** The mobile wallet work being done
   by the mobile workstream (send-flow validation) is the highest direct
   user-fund risk; it lands before anything else here.
4. **Scope the bearer tokens.** `CRON_SECRET`, `INDEXER_WORKER_SECRET`,
   `AGENT_BRIDGE_SECRET`, `GOD_MODE_SECRET` are long-lived shared strings.
   Give each caller its own value, log which one was used, and rotate any that
   predate 2026.
5. **Confirm DB backup cadence.** Railway Postgres (`pooter-indexer`) holds
   accounts + the claim ledger. Verify Railway's automated backups are on,
   test one restore, and export a periodic dump off-Railway (encrypted).
6. **Rename and audit `PRIVATE_KEY`.** A generic name for a funded key invites
   accidental reuse in the wrong context. Identify the wallet, rename the var,
   cap the balance it holds.
7. **Dependency audit cadence.** `npm audit` (or `osv-scanner`) monthly and on
   every dependency bump; the web app carries wallet-adjacent packages
   (wagmi/viem/RainbowKit) where supply-chain compromise is the realistic
   attack. Pin the lockfile in CI.
8. **Cloudflare/AWS token scoping.** Verify `CLOUDFLARE_API_TOKEN` is scoped
   to the one product it needs (not zone/DNS edit), and the AWS key is a
   bucket-scoped IAM user.
9. **Secret scanning in CI.** Add a pre-push/CI secret scan (gitleaks) so a
   key pasted into a test file never reaches GitHub. This repo has enough env
   names in play that an accident is a matter of time.
10. **Operator access review.** Two-person team, but list who can reach the
    Railway dashboard, GitHub org, Cloudflare, and the Resend account; enable
    2FA everywhere it isn't already; remove any stale collaborator.

---

## 3. Incident basics

### Rolling back production

Production deploys automatically from GitHub `main` (Railway project
`faithful-purpose`, service `morality-network`).

- **Preferred:** Railway dashboard → `faithful-purpose` → `morality-network`
  → Deployments → pick the last known-good build → **Redeploy**. No git
  surgery, takes effect in minutes.
- **Git route:** `backup/prod-*` tags mark known-good states. Create a branch
  from the tag, fast-forward or merge it to `main`, and the GitHub integration
  redeploys. Never force-push `main`.
- After any *manual* `railway up`, re-link to production:
  `railway link -p faithful-purpose -e production -s morality-network`.

### Where logs live

- **Web (prod):** Railway → `faithful-purpose` → `morality-network` → Logs
  (build + deploy + runtime). Same layout for dev on `earnest-love`.
- **Workers/indexer:** Railway → `pooter-indexer` (Ponder indexer, Postgres,
  agent workers — the Hyperliquid trader logs are on `pooter-agent-worker`).
- **Agent Hub:** Railway → `heartfelt-flow`.
- **Edge:** Cloudflare dashboard for pooter.world (WAF events, cache, DNS
  audit log).
- **Email:** Resend dashboard (delivery logs for magic links / newsletter).
- Railway log retention is limited — if an incident needs forensics, export
  logs immediately.

### If a key leaks

Assume spent: rotate the credential at the provider, redeploy, then assess.
For onchain keys, move funds/operator role to a fresh key first, then rotate
the env var. Note: LedgerAnchor's operator is `immutable`
(`contracts/src/LedgerAnchor.sol`) — if that key leaks, recovery means
deploying a fresh LedgerAnchor with a new operator and repointing
`LEDGER_ANCHOR_ADDRESS` on the web service; the old contract simply stops
receiving roots. Know that path before you need it.
