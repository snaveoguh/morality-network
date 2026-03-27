# Pooter.world — Claude Instructions

## Deployment Rules

**ALWAYS deploy to dev first. NEVER deploy directly to production unless the user explicitly says "deploy to prod" or "push to prod".**

### Deploy to dev (DEFAULT — do this first):
```bash
railway link -p earnest-love -e dev -s morality-network && railway up --detach
```
- URL: https://dev.pooter.world
- Railway URL: https://morality-network-dev.up.railway.app

### Deploy to prod (ONLY when user explicitly asks):
```bash
railway link -p earnest-love -e production -s morality-network && railway up --detach
```
- URL: https://pooter.world

### After any deploy, always re-link to production:
```bash
railway link -p earnest-love -e production -s morality-network
```

## Workflow
1. Make changes
2. Deploy to dev
3. User tests on dev.pooter.world
4. If good, user says "push to prod" → deploy to production

## Git Workflow
- **NEVER work directly on `main`.** Always create a feature branch first.
- Branch naming: `feat/short-description`, `fix/short-description`, `chore/short-description`
- Commit early and often — small, atomic commits with clear messages
- Before deploying to dev, commit all changes so nothing is lost
- When user says "deploy" or "push to dev": commit → push branch → deploy to dev
- When user says "push to prod": merge branch to main → deploy to prod
- **Never force push.** Never rebase published branches.
- If unsure whether to commit, commit. Lost work is worse than extra commits.

## Build Gotchas
- `siwe` exports `generateNonce` (NOT `generateSiweNonce`) and requires `ethers` as peer dep
- `@rainbow-me/rainbowkit` needs `--legacy-peer-deps` with Next.js 16
- `iron-session` v8 has no `IronSessionData` export — define own interface
- RSS feed errors at build time are handled gracefully (try/catch per source)

## Project Structure
- Web app: `web/` (Next.js 14, App Router, Tailwind, wagmi v2, viem, RainbowKit, SIWE)
- Agent: `agents/pooter1/` (Pooter bot — editorial writer, Farcaster poster)
- Contracts: `contracts/` (Solidity 0.8.24 on Base L2)
- Mobile: `mobile/` (React Native / Expo)
- Build config: `railway.json` in repo root
