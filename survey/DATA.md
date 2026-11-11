# Data audit — what elevation data actually exists for Costa Rica

Checked 2026-11-11. "Reachable here" means reachable from the cloud sandbox this pipeline was built in, whose
network only allows public AWS S3 / GCS buckets, GitHub and package registries. Hosts marked ✘ were blocked
there and are reported from documentation and literature, not tested downloads.

## Bottom line

**Costa Rica has no usable open airborne lidar outside one small research block.** NASA G-LiHT never flew
Central America. The only open airborne lidar found over Costa Rica is the 2009 TEAM survey of La Selva
(about 150 km² of Caribbean lowland forest, CC BY 4.0, on OpenTopography). The large Costa Rican lidar
campaign that would matter, Tulane MARI's LidArc survey of over 1,000 km² (Línea Vieja, Guayabo de Turrialba,
Osa, Río San Juan, Santa Rosa), started in 2025 and has not published data. What *is* openly available
nationally is 30 m satellite elevation (Copernicus GLO-30, ALOS, NASADEM), which shows the shape of the
land but **cannot see mounds, house platforms or most causeways** (they are 0.5–5 m high and 10–50 m across,
i.e. one or two 30 m pixels, and GLO-30 is a surface model that includes the forest canopy).

So the pipeline is validated on open 1 m lidar elsewhere (USGS 3DEP over Georgia platform-mound sites, with
the Yucatán G-LiHT run wired up for when its host is reachable), and the Costa Rica run on GLO-30 is a
**plumbing test plus a search for very large earthworks only**, not a mound survey.

## Sources

| Source | Covers Costa Rica? | Resolution / type | Licence | Access | Reachable here | Use in pipeline |
|---|---|---|---|---|---|---|
| **NASA G-LiHT** (GLDTMK, GLDSMT, GLCHMK…, LP DAAC) | **No.** Flights: CONUS, Alaska, Puerto Rico, Mexico (2013 Yucatán AMIGACarb transects). None over Costa Rica, Nicaragua or Panama. | 1 m DTM/DSM/CHM (0.5 m reprocessed DEMs on the Scholar@UC mirror) | CC BY 4.0 (AWS Open Data registry entry) | LP DAAC needs a free Earthdata login (`EARTHDATA_TOKEN`); S3 `lp-prod-protected` needs Earthdata temporary credentials. Open mirror: University of Cincinnati Scholar@UC, "G-LiHT Yucatan Peninsula – 50cm/pixel DEM GeoTIFF files" | ✘ `cmr.earthdata.nasa.gov`, `scholar.uc.edu` blocked | `source = "gliht"`: Yucatán calibration area `yuc_campeche_l2s502` (transect l2s502, contains Šprajc 2026 nested complex #1) |
| **OpenTopography — TEAM lidar, La Selva 2009** | **Yes, small:** ~-84.11 to -83.95 E, 10.34–10.50 N (La Selva / Sarapiquí, Caribbean lowlands) | Discrete-return airborne lidar point cloud (derive a 1 m DTM) | CC BY 4.0, DOI 10.5069/G9P8491K | OpenTopography portal download (free account for bulk) | ✘ `portal.opentopography.org` blocked | `source = "local"`, area `cr_laselva_lidar`: download, grid to a DTM GeoTIFF, put it at `survey/.data/local/laselva_team_2009_dtm.tif` |
| OpenTopography global rasters (GLO-30, SRTM, ALOS, NASADEM) | Yes (global) | 30–90 m | per dataset | API key required | ✘ | not needed: GLO-30 read from AWS directly |
| **Costa Rica national (IGN / SNIT)** | Partial, not open lidar | IGN publishes 1:5,000 / 1:25,000 cartography (orthophotos, contours) via SNIT viewers and OGC services; its object catalogue lists lidar as one capture method, but no national lidar DTM product or download was found. Lidar exists for project areas (e.g. Ruiz, Garro & Soto 2014 case studies incl. possible pre-Hispanic features near Arenal; ICE and municipal surveys; 2025 Isla del Coco survey) but is not openly distributed. | Government data; terms per layer | SNIT (`snitcr.go.cr`), IGN requests | ✘ `snitcr.go.cr` blocked; not verified hands-on | none yet. Ask IGN/SNIT and the Museo Nacional which lidar exists for Diquís and Turrialba before buying any. |
| **CRDTM2020** (UNA, "Regional bare-earth DTM for Costa Rica based on NASADEM corrected for vegetation bias") | Yes, national | 1 arc-second (~30 m) bare-earth estimate | academic (check repository) | UNA repository | ✘ not tested | better than GLO-30 for landform context; still far too coarse for mounds |
| **Copernicus GLO-30** | Yes, national | 30 m **DSM** (canopy and buildings included), 2011–2015 TanDEM-X | Copernicus DEM licence: free, attribution required | Public S3 `copernicus-dem-30m` (no login) | ✔ | `source = "glo30"`: the Costa Rica survey areas. Can only see features ≥ ~100 m across and several metres high relative to the canopy-smoothed surface. |
| ALOS AW3D30 (JAXA) | Yes | 30 m DSM | free with registration | JAXA / OpenTopography | ✘ | none (same limits as GLO-30) |
| TanDEM-X 12 m (DLR) | Yes | 12 m DSM | science proposal or commercial (WorldDEM) | DLR | ✘ | worth a DLR science proposal if lidar is not obtainable: 12 m sees large plazas and long causeways, still not house mounds |
| **GEDI** (NASA, L2A/L2B) | Yes, as samples | 25 m footprints, ~60 m along-track, tracks ~600 m apart; ground elevation + canopy profile per footprint | public domain, Earthdata login | LP DAAC / ORNL DAAC | ✘ | not used. Footprints are samples, not a surface: a 30 m mound is hit by chance at best. The study "Space Lidar for Archaeology? Reanalyzing GEDI Data for Detection of Ancient Maya Buildings" (code: github.com/JohMast/GEDI_Yucatan) tested exactly this in Yucatán. Because GEDI samples footprints rather than mapping a surface, it can at best show a structure that a footprint happens to hit. |
| **Sentinel-2 L2A** | Yes | 10 m (B2/3/4/8), 20 m red edge/SWIR, 5-day revisit | Copernicus open licence | Public S3 `sentinel-cogs` (COGs, listed by MGRS tile `16P…`/`17P…`) | ✔ (bucket); ✘ Earth Search STAC API | not in v1. Useful for crop/vegetation marks and straight linear features in pasture (Diquís delta is mostly open farmland and palm), not under forest. Next step: dry-season NDVI and red-edge composites as a second evidence layer. |
| ESA WorldCover 10 m | Yes | land cover | CC BY 4.0 | Public S3 `esa-worldcover` | ✔ | not in v1; can down-weight candidates in built-up/cropland classes |
| **USGS 3DEP 1 m** (US only) | No | 1 m lidar bare-earth DTM, cloud-optimised GeoTIFF | public domain | Public S3 `prd-tnm` (no login), 10 km UTM tiles | ✔ | **calibration**: Georgia platform-mound sites (Ocmulgee, Lamar, Etowah, Kolomoki, Nacoochee) |
| **Overture Maps** (OSM-derived buildings, roads, rail, land use) | Yes | vector | ODbL for OSM-derived layers (attribution: © OpenStreetMap contributors, Overture Maps Foundation) | Public S3 GeoParquet `overturemaps-us-west-2`, release 2026-10-21.0 | ✔ | modern-structure mask |
| OSM Overpass (`historic=archaeological_site`) | Yes | points/polygons | ODbL | Overpass API | ✘ `overpass-api.de` blocked; Overture does not carry `historic=*` | not in v1. Overture's Meta-sourced "historic_site" places were checked and are unusable for archaeology (e.g. "Ruinas de Tulum" geocoded in Costa Rica). |

## Known-site lists

- Costa Rica: the Museo Nacional keeps the national register of archaeological sites (the "Orígenes" database).
  It is **not public** and must not be put in this repo. `known_sites/costa_rica_public.csv` only holds sites that
  are already public (UNESCO Diquís component sites, Guayabo National Monument, published excavations), with
  approximate coordinates and wide radii. A candidate outside them is **not** therefore new: only the Museo
  Nacional can say that.
- Georgia calibration: `calibration/ga_mounds_verified.csv` (public park sites, MIT; see `calibration/README.md`).
- Yucatán calibration: `calibration/maya_calibration.csv` (one published, transect-specific site).

## What it would take to survey Costa Rica properly

1. **Ask before buying.** Write to the Museo Nacional (Departamento de Antropología e Historia) and IGN/SNIT asking
   what lidar already exists over the Diquís delta (Palmar Sur, Sierpe), the Turrialba valley and Línea Vieja, and
   whether the LidArc team (Tulane MARI / Hoopes / Salgado) will share DTMs. Costa Rican archaeological research
   needs approval from the Comisión Arqueológica Nacional anyway, so this is the right first door.
2. **Get the La Selva TEAM lidar** from OpenTopography (CC BY 4.0) and run `cr_laselva_lidar`. It is a real 1 m
   test on Costa Rican rainforest terrain, even if few sites are expected there.
3. **Commission or join lidar for the three target zones.** A targeted airborne lidar block of ~100 km² (Diquís
   delta core) costs on the order of tens of thousands of USD; drone lidar for a few km² around a specific
   hypothesis is far cheaper. Ground-classified 0.5–1 m DTMs are what this pipeline needs.
4. **Meanwhile** use Sentinel-2 dry-season composites over open farmland in the Diquís delta (vegetation marks,
   straight features) and TanDEM-X 12 m (science proposal) for large plazas and long calzadas.

## Downloading (what the code does)

- 3DEP: lists `s3://prd-tnm/StagedProducts/Elevation/1m/Projects/<STATE>_*/TIFF/` anonymously over HTTPS, picks
  tiles by name (`USGS_1M_<zone>_x<E/10 km>y<N/10 km>_…`), and reads only the needed window of each COG.
- GLO-30: downloads the 1° tiles `Copernicus_DSM_COG_10_<N..>_00_<W..>_00_DEM.tif` from `copernicus-dem-30m`.
- G-LiHT: downloads the configured file from the Scholar@UC mirror, or from LP DAAC with `EARTHDATA_TOKEN`.
- Overture: pyarrow dataset scan of the release's GeoParquet with a bbox filter; cached as JSON in `.data/overture/`.
- Everything lands in `survey/.data/` (gitignored) and is warped to a UTM grid at the area's `res_m`.

## Sources consulted

- AWS Open Data registry entry for NASA G-LiHT (CONUS, Alaska, Puerto Rico, Mexico; CC BY 4.0; Earthdata login) —
  github.com/awslabs/open-data-registry `datasets/nasa-g-liht.yaml`
- sen2008/maya-lidar-pilot `data/TILE.md` (Scholar@UC open G-LiHT mirror, transect l2s502, Šprajc 2026 complex #1)
- TEAM lidar data over La Selva, Costa Rica 2009 — catalog.data.gov / OpenTopography DOI 10.5069/G9P8491K
- Ruiz, Garro & Soto (2014), "The use of lidar images in Costa Rica: case studies applied in geology, engineering,
  and archaeology", Revista Geológica de América Central
- Tulane University news (2025), "Tulane takes leading role in $10 million global archaeology mapping initiative" (LidArc)
- "Regional bare-earth digital terrain model for Costa Rica based on NASADEM corrected for vegetation bias"
  (CRDTM2020), Universidad Nacional repository
- IGN Costa Rica, NTIG CR02 object catalogues (DEM / terrain model), snitcr.go.cr
