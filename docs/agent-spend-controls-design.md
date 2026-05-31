# Agent Spend Controls — Design (Safe + Zodiac Roles)

Status: **design** (no code yet). Supersedes the bespoke
`session-keys.ts` + `spend-permits.ts` TODO on this branch.
Decision basis: the Zodiac integration memo (Option 2 — Safe + Zodiac on top of
the existing per-agent Kernel SCWs).

## Problem this solves

Today the only thing standing between a leaked `AGENT_WORKER_HMAC_SECRET` and a
drained agent wallet is the LLM prompt. The signing API (`POST
/api/v1/agents/[id]/{tx,skill}`) will sign *any* transaction the (authenticated)
caller asks for, up to the wallet's full balance. We need a **structural,
on-chain cap** that holds even if the API secret leaks.

Audit confirmed the surrounding controls are sound (HMAC 60s window +
timingSafeEqual; admin-auth fail-closed; dryRun defaults true; agentId
allowlist). The spend cap is the one missing layer.

## Architecture

```
operator EOA ──owner──▶ Safe (treasury holder)
                          │
                          ├─ Zodiac Roles module ──▶ per-agent role (allowlist)
                          │                            ▲
                          │           execTransactionWithRole(to,val,data,roleKey)
                          │                            │
agent Kernel SCM ─────────┴─ role member ─────────────┘   (UserOp via Pimlico)
   (runtime identity, unchanged)
```

- **Keep** the per-agent Kernel SCWs as the runtime identity (no change to
  `factory.ts` / `owner-keys.ts`).
- **Add** one shared **Safe** as the treasury holder (lean: one Safe, one role
  per agent — cheaper than per-agent Safes, simpler accounting).
- **Roles module**: each agent SCW address is a role member with a function- and
  param-level allowlist matching the live skills.
- **Delay module**: timelock on treasury-scale moves (distribute/withdraw above a
  threshold) with the operator EOA as vetoer.
- Funds distributed by the treasury rail land in the **Safe**, not in each SCW.
  Agents *spend* via Roles; they don't hold custody.

## The one code change that matters: skill execution path

Every skill currently ends in `ctx.wallet.sendTx({ to, data, value })`
(`AgentWallet.sendTx` in `web/src/lib/wallets/types.ts`, implemented in
`factory.ts`). That call goes straight to the target contract with no cap.

Replace the terminal call with a Roles-routed call. Two options:

1. **Wrap at the wallet layer (preferred — minimal blast radius):** give
   `AgentWallet` a second method and have skills keep calling one function.

```ts
// types.ts
export interface AgentWallet {
  agentId: string;
  address: Address;
  /** Direct send — retained for gas-only / non-treasury txs. */
  sendTx(tx: { to: Address; data?: Hex; value?: bigint }): Promise<Hex>;
  /** Capped send routed through the agent's Zodiac role. Throws if the
   *  (to, selector, params) tuple is outside the role allowlist, or if the
   *  per-window spend cap is exceeded. */
  sendViaRole(tx: { to: Address; data?: Hex; value?: bigint }): Promise<Hex>;
}
```

`sendViaRole` builds an `execTransactionWithRole(to, value, data, roleKey,
shouldRevert=true)` call to the Roles module and submits it as a UserOp from the
agent's Kernel SCW (Pimlico still sponsors — origin is unchanged). The cap and
allowlist are enforced **on-chain** by the module; the API can't override them.

2. **Per-skill opt-in:** add `treasuryScoped: boolean` to `SkillHandler` and
   route only those skills through `sendViaRole`. `comment` (no value) can stay on
   `sendTx`; `swap`/`transfer`/`tip-agent`/`wrap` go through the role.

Recommendation: option 1 + a per-skill flag, so comment-style zero-value calls
skip the role overhead while anything that moves value is capped.

## Role allowlist (initial)

| skill | target | constraint |
|-------|--------|------------|
| swap | Uniswap V3 router, Aerodrome router | tokenIn ∈ {WETH,USDC}; max N USDC-equiv/tx; min slippage floor |
| transfer | USDC, WETH, native | to ∈ {known set}; max N/tx |
| tip-agent | USDC/WETH | to ∈ agent-SCW allowlist only; small cap |
| wrap | WETH contract | deposit/withdraw only; max N/tx |
| comment | MoralityComments | zero value — no role needed |

Per-window (daily) aggregate cap per agent enforced by a Roles allowance.

## Interfaces to add (no logic yet)

```
web/src/lib/wallets/roles/
  config.ts        // Safe addr, Roles module addr, per-agent roleKey, ABIs
  client.ts        // viem client to encode execTransactionWithRole
  allowlist.ts     // declarative per-skill scope (target, selector, param rules)
  index.ts
```

`AgentWallet.sendViaRole` lives in `factory.ts` and consults `roles/`.
Feature-flag the whole path behind `AGENT_ROLES_ENABLED` so the current
`sendTx` behaviour is the default until the Safe + module are deployed and the
allowlist is scoped.

## Phased rollout

1. **Now:** this doc + the empty `roles/` interfaces + `AGENT_ROLES_ENABLED`
   flag (default off). No behaviour change.
2. Deploy a Safe (1/1 operator owner) on Base; enable Roles module.
3. Scope each agent SCW as a role with the allowlist above; set daily caps.
4. Implement `sendViaRole`; flip treasury-scoped skills to it behind the flag.
5. Point the treasury `distribute` destination at the Safe instead of SCWs.
6. Enable Delay module for distribute/withdraw above threshold (operator vetoer).
7. Later: Reality (optimistic governance of policy), Exit (redemption).

## Open questions (carry from the memo)

- Shared Safe + one role/agent (leaning yes) vs per-agent Safe.
- Operator EOA position in the stack (proposer/vetoer on Delay).
- Keep Pimlico sponsorship for Roles calls (yes — UserOp still originates from
  the Kernel SCW).

## Out of scope here

- The `bet` skill (needs confirmed Base MoralityPredictionMarket address).
- Vault refactor (`MoralityAgentVault.allocateCapital` → per-agent custody).
- HL repatriation path (Base→HL).
