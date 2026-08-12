# ISO 27001 Gap Checklist — pooter.world

> Compiled 2026-08-12. Shaped after ISO/IEC 27001:2022 Annex A control themes,
> scoped honestly to what pooter.world is: a two-person crypto-media platform.
> We are not pursuing certification. Most controls are marked
> **absent, acceptable at current scale** — inventing an ISMS bureaucracy for
> two people would be theatre. The point of this document is the handful of
> controls that actually matter *now*, marked **PRIORITY**.

Legend: state → gap → first step. Companion doc: `docs/SECURITY_BASELINE.md`.

---

## A.5 Organisational controls

| Control theme | Current state | Gap | First step |
|---|---|---|---|
| Information security policy (5.1) | None written | No stated policy | `SECURITY_BASELINE.md` is the de-facto policy; a one-paragraph statement at its top would close this at our scale |
| Roles & responsibilities (5.2) | Implicit — one operator, one collaborator | No written split | One line per system: who holds admin on Railway / GitHub / Cloudflare / Resend |
| Threat intelligence (5.7) | Ad-hoc (crypto-twitter, dependency advisories) | No feed | Subscribe the repo to GitHub Dependabot alerts — done in minutes, real value |
| **Supplier relationships (5.19–5.23) — PRIORITY** | Heavy reliance on Railway (hosting, DB), Cloudflare (DNS/edge), Resend (email), Upstash (Redis), Hyperliquid (live funds), RPC providers | No inventory of what each supplier can see/lose, no exit plan | Keep the supplier table (below) current; for each: what data they hold, what breaks if they vanish, how to rotate credentials with them |
| Cloud services security (5.23) | Railway/Upstash on default configs | No hardening review | Check Railway service isolation, Postgres public-network exposure, Upstash TLS |
| **Incident management (5.24–5.28) — PRIORITY** | Rollback path and log locations documented in `SECURITY_BASELINE.md`; no on-call, no severity scale | No written "who does what at 3am" | The incident-basics section is the playbook; add a single severity rule: "user funds or key material involved = drop everything" |
| Legal/regulatory (5.31–5.34) | Privacy page shipping (`/privacy`); UK GDPR bases stated; no solicitor review yet | ICO registration status unverified; solicitor review pending | Book the solicitor review already flagged in the privacy page source; confirm whether ICO registration fee applies |
| Absent & acceptable at current scale | Segregation of duties (5.3) — impossible with two people; security in project mgmt (5.8); classification scheme (5.12–5.13); records mgmt beyond git | — | Revisit at first hire |

## A.6 People controls

| Control theme | Current state | Gap | First step |
|---|---|---|---|
| Screening, terms, awareness (6.1–6.3) | Two founders; no formal process | Absent, acceptable at current scale | Revisit at first hire/contractor |
| Remote working (6.7) | Everything is remote; operator laptop is the crown-jewel machine | Laptop holds a plaintext onchain key | Move the key (top action in `SECURITY_BASELINE.md`); FileVault + screen lock assumed — verify |
| Confidentiality agreements (6.6) | None | Absent, acceptable | NDA template only when a contractor first touches prod |

## A.7 Physical controls

| Control theme | Current state | Gap | First step |
|---|---|---|---|
| Physical security (7.1–7.14) | No premises; infrastructure is Railway/Cloudflare's problem | Largely inherited from suppliers | Only real asset: the operator Mac. Full-disk encryption on, and the key file off it |

## A.8 Technological controls

| Control theme | Current state | Gap | First step |
|---|---|---|---|
| **Access control / identity (8.1–8.5, 5.15–5.18) — PRIORITY** | Personal accounts on Railway/GitHub/Cloudflare/Resend; shared long-lived bearer secrets between services; `GOD_MODE_*` operator override | No per-caller credentials, unknown 2FA coverage | 2FA audit across the four dashboards; split shared bearer tokens per caller (action 4 in baseline) |
| Privileged access (8.2) | God-mode addresses + secret gate admin endpoints | Backdoor by construction, weakly scoped | Log every god-mode use; rotate `GOD_MODE_SECRET` |
| **Cryptography (8.24) — PRIORITY** | Good story onchain (keys never leave device for users; ZK recovery); weak story operationally (plaintext key file, generic `PRIVATE_KEY`, dev-fallback session secret) | Key management is the gap, not algorithms | Actions 1, 2, 6 in `SECURITY_BASELINE.md` |
| **Operations security / config (8.9, 8.19, 8.32) — PRIORITY** | Deploys via GitHub→Railway auto-deploy; `backup/prod-*` tags; dev-gate workflow documented | No CI checks enforced before `main`; config drift between dev/prod envs untracked | Add a required build+typecheck check on `main`; diff dev vs prod env var *names* quarterly |
| Malware / endpoint (8.1, 8.7) | Default macOS protections | Absent, acceptable | — |
| **Vulnerability & patch management (8.8) — PRIORITY** | Ad-hoc `npm install` when things break | No cadence | Monthly `npm audit` + Dependabot (action 7 in baseline) |
| **Backup (8.13) — PRIORITY** | Railway Postgres; backup status unverified; git history for code | Untested restore = no backup | Verify Railway backups on, do one restore drill, keep an encrypted off-Railway dump (action 5 in baseline) |
| Logging & monitoring (8.15–8.16) | Railway logs (short retention), Cloudflare edge logs, Resend delivery logs | No alerting, no retention | A single uptime + error-rate alert (Railway webhooks or a free pinger) covers 90% of need |
| Network security (8.20–8.23) | Cloudflare in front of prod; Railway internal networking | Postgres exposure unaudited | Confirm the DB is not publicly reachable; keep Cloudflare proxied (orange-cloud) on all records |
| Secure development (8.25–8.31) | Solidity contracts reviewed ad-hoc; web changes gated through dev.pooter.world | No formal SDLC, no secret scanning | gitleaks in CI (action 9); keep the dev-gate discipline |
| Data leakage / DLP (8.10–8.12) | Public-by-design product; little private data (email + wallet links) | Minimal surface | Keep it that way — data you never collect can't leak |
| Web filtering, source code access (8.23, 8.4) | Public repo policies unreviewed | Low risk | Confirm which repos are public vs private on GitHub |

---

## The eight that matter now

1. **Access control** — 2FA everywhere, split shared bearer secrets (A.8.1–8.5)
2. **Cryptography / key management** — plaintext key file off the laptop, session secret fails closed (A.8.24)
3. **Operations security** — CI gate on `main`, keep the dev-gate discipline (A.8.9/8.32)
4. **Supplier management** — Railway/Cloudflare/Resend/Upstash/Hyperliquid inventory + credential rotation paths (A.5.19–5.23)
5. **Incident management** — rollback + logs documented; add the severity rule (A.5.24–5.28)
6. **Backup** — verify and drill the Postgres restore (A.8.13)
7. **Vulnerability management** — monthly audit cadence, Dependabot on (A.8.8)
8. **Legal/privacy** — solicitor review of `/privacy`, ICO registration check (A.5.31–5.34)

Everything else: absent, acceptable at current scale, revisit at first hire or
first external capital.
