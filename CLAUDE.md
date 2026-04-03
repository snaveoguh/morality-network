# Pooter.world — Claude Instructions

## Deployment Rules

**Production auto-deploys from `main` via GitHub integration on faithful-purpose.**
**Dev is live at `dev.pooter.world` on `earnest-love / dev / morality-network`, but Railway CLI metadata does not currently surface a tracked branch/commit for that service.**

`pooter.world` is served from Railway (`faithful-purpose`) behind Cloudflare DNS.
`dev.pooter.world` is currently serving from Railway (`earnest-love / dev / morality-network`) behind Cloudflare DNS.

### Deploy to prod:
Production deploys **automatically** when you push/merge to `main` on GitHub.
faithful-purpose's GitHub integration picks it up and builds.

To manually deploy (if needed):
```bash
railway link -p faithful-purpose -e production -s morality-network && railway up --detach
```
- URL: https://pooter.world
- Railway project: `faithful-purpose`
- Cloudflare CNAME: `oewwxjq0.up.railway.app`

### After any manual deploy, always re-link to production:
```bash
railway link -p faithful-purpose -e production -s morality-network
```

### Dev:
```bash
# dev.pooter.world is live on earnest-love / dev / morality-network
# treat it as the dev target, but do not assume Railway is auto-deploying a specific branch
```
- URL: https://dev.pooter.world
- Railway project: `earnest-love`
- Current note: custom domain is attached and the site responds, but Railway status output does not currently expose a tracked branch/commit for dev the way production does

## Workflow
1. Make changes on a feature branch
2. Push to `dev` when you want to test on `dev.pooter.world`
3. Merge to `main` → faithful-purpose auto-deploys to pooter.world
4. Test on `dev.pooter.world` first, then verify production on `pooter.world`

## Railway Project Map

| Project | Role | Status |
|---------|------|--------|
| **faithful-purpose** | PROD — pooter.world, worker, deploys from GitHub `main` | ✅ Active |
| **earnest-love** | DEV — dev.pooter.world, polypooter sidecar | ⚠️ Live, but branch wiring still needs cleanup/confirmation |
| **pooter-indexer** | Indexer, Postgres, agent workers | ✅ Active |
| **heartfelt-flow** | Agent Hub (LLM router: Groq/Together) | ✅ Active |

See `memory/railway_projects.md` for full service-level detail.

## Git Workflow
- **NEVER work directly on `main`.** Always create a feature branch first.
- Branch naming: `feat/short-description`, `fix/short-description`, `chore/short-description`
- Commit early and often — small, atomic commits with clear messages
- When user says "deploy" or "push to prod": merge branch to main → auto-deploys via GitHub
- **Never force push.** Never rebase published branches.
- If unsure whether to commit, commit. Lost work is worse than extra commits.

## Build Gotchas
- `siwe` exports `generateNonce` (NOT `generateSiweNonce`) and requires `ethers` as peer dep
- `@rainbow-me/rainbowkit` needs `--legacy-peer-deps` with Next.js 16
- `iron-session` v8 has no `IronSessionData` export — define own interface
- RSS feed errors at build time are handled gracefully (try/catch per source)
- `gsap` must be in dependencies (not just devDependencies) for Railway builds

## Project Structure
- Web app: `web/` (Next.js 16, App Router, Tailwind, wagmi v2, viem, RainbowKit, SIWE)
- Agent: `agents/pooter1/` (Pooter bot — editorial writer, Farcaster poster)
- Contracts: `contracts/` (Solidity 0.8.24 — Base L2 + Ethereum mainnet prediction market)
- Mobile: `mobile/` (React Native / Expo)
- Current web deploy target: Railway `faithful-purpose / production / morality-network`
- Build config: `railway.json` in repo root

## Key Contracts
- Prediction market proxy (Ethereum): `0x2ea7502c4db5b8cfb329d8a9866eb6705b036608`
- Prediction market proxy (Base): `0x71b2e273727385c617fe254f4fb14a36a679b12a`
- MO token (Base): `0x8729c70061739140ee6bE00A3875Cbf6d09A746C`
