This folder documents the local-only backup state preserved on March 21, 2026.

Top-level backup branch:
- `codex/full-backup-20260321`
- commit `85cd71b816bad220561709f590564422d247cc42`

Nested OpenZeppelin submodule backup:
- repo `contracts/lib/openzeppelin-contracts`
- branch `codex/backup-20260321-oz-submodule`
- commit `3d3be4b072a127d6a858b0811b780fa300238a37`

Files:
- `top-level-submodules.txt`: submodule SHAs from the main repo at backup time
- `openzeppelin-contracts-nested-submodules.txt`: nested submodule SHAs inside the OpenZeppelin submodule
- `openzeppelin-contracts-submodule-backup.patch`: patch for the local-only OpenZeppelin submodule backup commit

Why this exists:
- the top-level repo can be pushed to GitHub
- the nested OpenZeppelin backup commit lives in a third-party submodule repo and is not pushed upstream
- this patch keeps that local-only state recoverable from the GitHub backup branch
