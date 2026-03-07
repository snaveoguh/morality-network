# README Update Checklist

Use this checklist before merging any substantial feature.

## Root README (`v2/README.md`)

- [ ] New features reflected in "What is this?"
- [ ] Contract/API/indexer links updated
- [ ] Setup instructions still correct
- [ ] New required env vars documented

## Package READMEs

### Web (`v2/web/README.md`)
- [ ] New route/pages documented
- [ ] API usage examples updated

### Extension (`v2/extension/README.md` if present)
- [ ] Permissions and UX behavior updated
- [ ] Build/load steps still accurate

### Indexer (`v2/indexer/README.md`)
- [ ] Endpoint list updated
- [ ] Runtime dependencies (RPC/DB) documented
- [ ] Local run and deployment instructions verified

## Docs Sync

- [ ] `API_REFERENCE.md` updated for endpoint changes
- [ ] `DEPLOYMENTS.md` updated for address/config changes
- [ ] `STATUS_LOG.md` appended with release note
- [ ] `DELIVERABLES_MASTER.md` status adjusted
