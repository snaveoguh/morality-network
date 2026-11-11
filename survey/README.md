# survey/ — ancient-site survey pipeline (Costa Rica first)

Desk-based screening of elevation data for possible unrecorded archaeological earthworks (mounds, platforms,
causeways, terraces), with a cheap classical filter doing the heavy lifting and a small, budget-capped panel of
AI "reviewer" agents looking only at a shortlist. Inspired by Pietro Miotti's November 2026 report of ~48 agents
screening NASA lidar in the Maya lowlands (unverified on the ground).

**Status: first working version.** It runs end to end and is validated on open lidar with known sites
(see `out/validation_*.md`). **For Costa Rica there is no usable open lidar yet** (see `DATA.md`), so the Costa Rica
run is on 30 m satellite elevation, which cannot see mounds. Nothing this tool outputs is a discovery.

### Validation so far (2026-11-11, `out/validation_offline.md`)

Four Georgia calibration areas, USGS 3DEP 1 m lidar, 90 km², 1,522 tiles of 250 m, top 50 tiles per area reviewed:

| stage | known mounds caught | known look-alikes flagged |
|---|---|---|
| detected by the classical filter | 12/12 | 12/13 |
| survive the modern mask | 12/12 | 5/13 |
| shortlisted (top 50 tiles × 2) | 9/12 | 1/13 |
| passed review (offline rule stand-ins) | 8/12 | 0/13 |

The three misses at the shortlist stage are all at Ocmulgee (Great Temple, Lesser Temple and Funeral mounds), which are
cut by a railroad and merge with its embankment and the river bluff, inside the city of Macon. Precision is low: of
the 91 candidates that passed review, 82 are more than 150 m from any listed site (0.5–1.6 per km²). Some are real
unlisted mounds (Kolomoki and Etowah have more mounds than the ground-truth file lists), most are natural spurs,
graded lots and stream banks. A model-backed review panel was not run (no API key in the build sandbox); that is
the next measurement. `ga_macon` was used for tuning; the closure feature was added after looking at Kolomoki
false positives, so Kolomoki is not a clean hold-out.

## Ethics rules (non-negotiable)

1. **Discovery and report only, never extraction.** In Costa Rica all archaeological material belongs to the
   State (Ley 6703 sobre Patrimonio Nacional Arqueológico). Excavating, collecting or moving anything without a
   permit from the Comisión Arqueológica Nacional is a crime. This tool must not be used for, or extended to
   help with, treasure hunting, metal detecting, grave looting or locating graves or offerings. Don't add
   features whose purpose is that (e.g. scoring for "burial" or "gold" likelihood). The same goes for the planned
   colonial-archive / shipwreck work: shipwrecks are protected heritage too.
2. **Exact coordinates are never published.** Exact positions live only in `out/candidates_private.geojson` and
   `out/private/` (both gitignored, never committed, never posted). Public outputs (`out/candidates_public.geojson`)
   are aggregated to ~5 km cells (0.05°). Don't post evidence-card images publicly either: a hillshade crop can be
   matched to a location.
3. **Private findings go to the authorities**, not to social media, not to a landowner first, not to a press release
   before the authorities have looked.
4. **AI spend is capped and fails closed.** The agent stage only sees the top-N tiles (default 50), has a hard dollar
   cap per run (default $0.50), checks the worst-case cost of each call before making it, and treats any error, refusal
   or budget stop as "not passed".

## How it works

```
DTM (lidar or DEM) ─▶ layers: hillshade, local relief (LRM), slope, sky-view factor
                  ─▶ raised features: LRM > threshold, connected components
                  ─▶ per-feature metrics: height, flank slope, rectangularity, solidity, flat top, regional slope
                  ─▶ rule score 0–1                                    ← classical, no AI, every tile scored
                  ─▶ masks: modern (Overture/OSM buildings, roads, rail, quarries…), known sites (CSV)
                  ─▶ tile scores; top N tiles × top 2 candidates each
                  ─▶ evidence image per candidate (4-panel render)
                  ─▶ 3 independent reviewer personas: geomorphologist sceptic, archaeologist, modern land-use checker
                     PASS = ≥2 say "archaeological" (conf ≥ 0.5) and land-use checker does not say "modern" (conf ≥ 0.7)
                  ─▶ outputs: private GeoJSON (exact), public GeoJSON (5 km cells), evidence cards (PNG + HTML)
```

Code: `ancient_survey/` — `sources.py` (data fetchers), `terrain.py`, `detect.py`, `mask.py`, `review.py`,
`render.py`, `pipeline.py`, `validate.py`, `__main__.py`. Areas live in `areas.toml`.

## Run it

```bash
cd survey
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m ancient_survey list
```

Calibration (known sites; writes `out/validation_<provider>.md`):

```bash
python -m ancient_survey validate ga_macon ga_etowah ga_kolomoki ga_nacoochee
```

Costa Rica survey areas (GLO-30 by default):

```bash
python -m ancient_survey run cr_diquis_delta cr_turrialba_guayabo cr_caribbean_lineavieja
```

With real AI reviewers (default model `claude-haiku-5-5`, $0.10 / $0.50 per million tokens; a 50-tile run is
about 300 calls and should cost well under $0.10):

```bash
export ANTHROPIC_API_KEY=...        # a key with its own spend limit set in the Console, not the prod web key
python -m ancient_survey run cr_diquis_delta --provider anthropic --budget-usd 0.25
```

Options: `--top-n` (tiles reviewed, default 50), `--per-tile` (candidates per tile, default 2), `--budget-usd`
(hard cap across all areas in the command), `--min-agree` (default 2), `--model`, `--price-in/--price-out` (needed
for models not in the price table), `--known-sites path.csv …` (extra known-site lists, e.g. a private register
extract kept outside the repo), `--no-modern-mask`.

Without `--provider anthropic` the reviewers are `offline` deterministic rules (no network, $0). They are stand-ins
for testing, not a language model, and their votes are labelled `offline-rules`.

Other data:
- Yucatán G-LiHT calibration (`yuc_campeche_l2s502`) needs `scholar.uc.edu` reachable, or set `url` to an LP DAAC
  link and export `EARTHDATA_TOKEN`.
- La Selva lidar (`cr_laselva_lidar`): download the TEAM 2009 dataset from OpenTopography, grid a DTM GeoTIFF and
  put it at `.data/local/laselva_team_2009_dtm.tif`.
- Any other DTM: add an area with `source = "local"` and `file = "path.tif"`.

## Outputs

| path | contents | committed? |
|---|---|---|
| `out/candidates_public.geojson` | ~5 km cells containing ≥1 candidate that passed review (survey areas only) | yes |
| `out/validation_*.md`, `.json` | recall / false-positive numbers on calibration areas | yes |
| `out/candidates_private.geojson` | every reviewed candidate, exact point + outline + status | **never** |
| `out/private/<area>/cards.html`, `cards/*.png` | evidence cards: 4-panel render, reasons, reviewer votes | **never** |
| `out/private/<area>/candidates_private.geojson`, `tiles.json`, `summary.json` | all raised features, tile scores | **never** |
| `out/private/review_ledger.jsonl` | every AI call: tokens, dollars | never |

## Reporting a possible site in Costa Rica

1. **Don't go there to dig, probe or collect, and don't tell anyone the location.** If you do visit (with the
   landowner's permission), only look and photograph; touch nothing.
2. Prepare a short private report: the evidence card(s), exact coordinates (WGS84 and CRTM05), the data source and
   date, what the pipeline and reviewers said, and why you think it is not already registered.
3. Send it to the **Museo Nacional de Costa Rica, Departamento de Antropología e Historia** (Programa de Registro /
   Protección del Patrimonio Arqueológico), San José, who keep the national site register and assess reports of
   new sites. Copy the **Comisión Arqueológica Nacional** if anything is under threat (construction, looting).
   Check the Museo Nacional's website (museocostarica.go.cr) for the current contact; ask them how they prefer
   to receive coordinates (not in a public email thread).
4. Let them decide on any field check. Archaeological fieldwork in Costa Rica needs a permit from the Comisión
   Arqueológica Nacional.
5. Only after the authorities have checked (and agree) is anything said publicly, and then at cell level only.

## Limits (read before trusting any number)

- The classical filter is hand-set rules, tuned only on one area (`ga_macon`) and checked on the other Georgia
  areas as hold-outs. It finds compact raised features; it does not see ditches, walls of stone, sunken features,
  or anything under 0.5 m at 1 m resolution.
- In built-up land, graded building pads, spoil heaps and embankments look like platforms. The modern mask removes
  mapped ones; unmapped ones reach the reviewers.
- The Georgia ground truth lists only some of the mounds at Etowah and Kolomoki, so "false positives" there are an
  upper bound.
- 30 m GLO-30 is a canopy surface. Costa Rica candidates from it are landforms, field edges or canopy texture far
  more often than earthworks.
