# Costa Rica run on Copernicus GLO-30 (30 m DSM) — 2026-11-11

No coordinates in this file. Exact positions are in `out/private/` (gitignored).

| area | km² | 1.5 km tiles | raised features | inside public known-site radii | on mapped modern features | reviewed | passed (offline rules) |
|---|---|---|---|---|---|---|---|
| Diquís delta (Térraba–Sierpe) | 927 | 437 | 3,100 | 63 | 14 | 100 | 39 |
| Turrialba / Guayabo | 619 | 285 | 1,955 | 36 | 59 | 100 | 19 |
| Línea Vieja (Caribbean foothills) | 1,483 | 690 | 6,101 | 24 | 75 | 100 | 44 |

**Verdict: no archaeological candidates. GLO-30 cannot do this job.** The top-ranked "passes" are 1.5–19 ha blobs
standing 12–25 m above their surroundings with closed outlines on flat ground. On the evidence cards these are
forest patches and riparian canopy strips along the delta's meanders, plantation or building blocks, and in
Turrialba, volcanic and erosional knobs. GLO-30 is a surface model: canopy height (15–30 m) is far larger than any
Costa Rican earthwork (mounds 1–5 m, calzadas under 1 m of relief), so at 30 m the forest edge is the dominant
"feature". The offline rule reviewers pass them because the shapes are regular; a model-backed panel, or a land-
cover mask (ESA WorldCover tree class), would reject them, but it would not turn them into sites.

Known-site check: the public Diquís, Guayabo and Línea Vieja sites lie inside raised-feature clusters only in the
sense that their 1.2–1.5 km mask radii contain some canopy blobs; none of the sites' actual structures (mounds,
calzadas, sphere platforms) is resolvable at 30 m. GLO-30 recall on Costa Rican sites is effectively zero, as the
data audit predicted.

`out/candidates_public.geojson` is therefore empty. What it would take to survey Costa Rica properly is in
`DATA.md` → "What it would take".
