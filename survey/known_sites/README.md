# Known-site lists (masks)

Candidates within `radius_m` of a row here are tagged `known_site` and left out of the "new candidates" outputs.
Only sites that are **already public** (UNESCO, national parks, museum visitor sites, published papers) belong in
these committed files. Never add coordinates from restricted registers (Museo Nacional's Orígenes database, INAH,
state site files) to the repo: load them at run time from a private path with `--known-sites`.

- `costa_rica_public.csv` — publicly visitable or UNESCO-listed sites. Coordinates are approximate (±0.5 km) and the
  radius is set to match. This is NOT a site register: Costa Rica has thousands of registered sites not listed here,
  so any candidate must still be checked by the Museo Nacional before anyone calls it new.
