# Continuation prompt — base smart wallets workstream

Paste this verbatim into a new Claude Code thread to pick up where the
previous session left off. Self-contained; don't edit unless something
material has changed.

---

I'm continuing the per-agent Base smart-wallet workstream on
`feat/base-smart-wallets`. The branch is at commit `f1e29ef` and ahead of
`dev`. Six commits have landed: per-agent Kernel SCW foundation, HMAC
signing API + worker wallet client, skill registry (swap / transfer /
tip-agent / wrap / comment) + dispatcher + portfolio endpoint, HL→Base
treasury rail (preview / hl-withdraw / bridge / distribute) + GeckoTerminal
signal feed, pooter1 and polypooter autonomous decide loops, and a comment
skill + peer-comments feed so agents can converse on
`MoralityComments`.

Before doing anything else, load `memory/base_smart_wallets.md` — it has the
canonical current state, env vars, decisions made, and what's still open.
Also load `memory/north_star.md` (objective) and
`memory/feedback_no_acquisition_framing.md` (keep Coinbase / acquisition /
"wedge" language out of code, docs, commit messages — the strategic framing
stays in private memory only).

The branch is in a good place but has NOT been run end-to-end yet. Next
concrete moves, in order:

1. **First treasury run on dev.** Run `./scripts/setup-dev-treasury.sh dev`
   to generate secrets and print the Railway + curl commands. Do NOT pipe
   it to bash — read it, run commands one by one. Stops:
   (a) set env vars on the `earnest-love` Railway web service (incl.
   PIMLICO_API_KEY from the user),
   (b) set matching `AGENT_WORKER_HMAC_SECRET` + `AGENT_API_BASE_URL` on
   each agent's Railway service, keep `DECIDE_ENABLED=false` for now,
   (c) `GET /api/v1/agents/<id>/wallet` to surface SCW addresses,
   (d) `GET /api/v1/admin/treasury/preview?amountUsd=20` to inspect state,
   (e) dry-run each of hl-withdraw → bridge → distribute, then real-run
   small amounts (~\$20 → \$18 → \$8 to each of two agents),
   (f) send ~0.001 ETH on Base from a personal wallet to each SCW,
   (g) trigger one `POST /tasks/decide` per agent, eyeball output,
   (h) flip `DECIDE_ENABLED=true DECIDE_DRY_RUN=false` on each agent.
   The user must supply the Pimlico API key and confirm each fund-moving
   step. Broad authorization ≠ silent execution.

2. **Session keys + spend permissions.** Once the decide loops are running
   live, replace the trust-the-LLM-prompt cap with a structural per-skill
   cap. Kernel has native session-key + spend-permission module support.
   New modules: `web/src/lib/wallets/session-keys.ts`,
   `web/src/lib/wallets/spend-permits.ts`. Each skill should optionally
   take a session key that constrains it (e.g. a daily wei cap for swap).

3. **Prediction-market `bet` skill.** `MoralityPredictionMarket.stake(dao,
   proposalId, isFor) external payable` exists, but the Base mainnet
   address is contested in the repo (architecture page says ETH-only,
   appendix lists a base-sepolia deployment). Confirm the Base mainnet
   address with the user before building.

4. **Vault refactor.** `MoralityAgentVault.allocateCapital` currently
   targets a single operator address. Make it per-agent SCW. Touches
   custody; needs an audit pass per `memory/architecture.md` →
   SECURITY_AUDIT.md flags.

Constraints to respect:
- Branch only — never push to `dev` or `main`. Promotion is the user's call.
- Treasury execute endpoints default `dryRun:true`. Never call them with
  `dryRun:false` without explicit current-turn confirmation, even if there's
  prior broad authorization.
- Don't touch `web/src/lib/trading/hyperliquid.ts` order-signing — separate
  workstream.
- Do NOT commit the pre-existing WIP on the working tree:
  `web/src/data/article-archive.json` (21MB OOM gotcha),
  `.claude/launch.json`, untracked `convert_noundry.py`, `__pycache__/`,
  `web/src/app/api/trading/signals/candidates/`,
  `web/src/lib/trading/execution-candidates.ts`.
- Keep all strategic/acquisition framing out of public artifacts (code
  comments, commit messages, docs that hit GitHub). Private memory only.

Open files worth orienting from before starting work:
- `web/src/lib/wallets/` (SCW + skills)
- `web/src/lib/treasury/` (HL + Across + distribute)
- `web/src/app/api/v1/agents/[id]/skill/route.ts` (dispatcher)
- `agents/shared/wallet-client.ts` (worker-side client)
- `agents/pooter1/src/tasks/decide.ts` + `agents/polypooter/src/tasks/decide.ts`
- `scripts/setup-dev-treasury.sh` (rollout helper)

Pick up at move #1 unless I direct otherwise.
