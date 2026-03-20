# Contributing

Thanks for contributing to pooter world v2.

## Repo Areas

- `contracts`: Solidity contracts and deployment scripts
- `web`: Next.js frontend + API routes
- `extension`: Chrome extension
- `indexer`: Ponder event indexer

## Contribution Rules

1. Keep PRs small and scoped to one subsystem when possible.
2. Include before/after behavior notes.
3. Update docs in `docs` when changing API, design tokens, or architecture.
4. Add/adjust tests for contract logic changes.
5. Avoid hardcoding production secrets or private keys.

## Branching

- Feature branches should be short-lived.
- Prefer clear names, e.g. `feat/indexer-feed-endpoint`.

## Pull Request Checklist

- [ ] Build passes locally for touched packages
- [ ] No secrets committed
- [ ] Docs updated
- [ ] API or ABI changes called out clearly
- [ ] Screenshots/video added for UX-impacting changes

## Areas Needing Help

- Governance source adapters (new countries + DAOs)
- Indexer endpoint performance
- Extension UX reliability
- Contract security tests and fuzzing
