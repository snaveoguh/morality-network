# Calibration results — review provider `offline`

## Totals (all calibration areas)

| stage | known mounds caught (recall) | known look-alikes flagged |
|---|---|---|
| detected | 12/12 (100%) | 12/13 (92%) |
| eligible | 12/12 (100%) | 5/13 (38%) |
| shortlist | 9/12 (75%) | 1/13 (8%) |
| passed | 8/12 (67%) | 0/13 (0%) |

## ga_macon

- USGS 3DEP 1 m lidar DTM, 45.8 km², 756 tiles; top 50 tiles reviewed by `offline` (spend $0.0)
- raised features found: 3260; after modern mask: 1709; shortlisted for review: 100; passed review: 25
- recall: detected 6/6, eligible 6/6, shortlist 3/6, passed 3/6
- look-alikes flagged: detected 11/12, eligible 5/12, shortlist 1/12, passed 0/12
- false positives (no listed site within 150 m): shortlisted 95/100, passed 22/25 (0.48 per km²; precision of passed = 0.12)

| feature | label | detected | eligible | shortlist | passed | score | mask flags |
|---|---|---|---|---|---|---|---|
| Great Temple Mound | mound | ✔ | ✔ | · | · | 0.7241 |  |
| Lesser Temple Mound | mound | ✔ | ✔ | · | · | 0.6996 |  |
| Funeral Mound | mound | ✔ | ✔ | · | · | 0.5898 |  |
| Earth Lodge (reconstructed) | reconstruction | ✔ | ✔ | ✔ | ✔ | 0.7763 |  |
| I-16 bridge abutment | lookalike | ✔ | · | · | · | 0.8029 | modern:road_or_rail_corridor(100%); urban_context:4_buildings_150m |
| I-16 bridge abutment 2 | lookalike | ✔ | · | · | · | 0.7053 | modern:road_or_rail_corridor(100%); modern:landuse:construction |
| Creek bank meander | lookalike | ✔ | ✔ | · | · | 0.7053 |  |
| Road embankment | lookalike | ✔ | ✔ | · | · | 0.7517 |  |
| Village trenches | earthwork | ✔ | ✔ | ✔ | · | 0.6893 |  |
| Civil War earthwork (V-shaped) | lookalike | · | · | · | · |  |  |
| Irregular debris piles (floodplain S of I-16) | lookalike | ✔ | · | · | · | 0.6784 | modern:landuse:industrial; urban_context:6_buildings_150m |
| Irregular debris pile 2 | lookalike | ✔ | · | · | · | 0.5788 | modern:landuse:industrial; urban_context:13_buildings_150m |
| Irregular debris piles 3 | lookalike | ✔ | · | · | · | 0.7627 | modern:landuse:industrial; urban_context:5_buildings_150m |
| Oval track ring | lookalike | ✔ | · | · | · | 0.6177 | modern:road_or_rail_corridor(54%); modern:landuse:commercial; urban_context:8_buildings_150m |
| Large graded city lot | lookalike | ✔ | ✔ | · | · | 0.346 | urban_context:49_buildings_150m |
| Lamar Mound A | mound | ✔ | ✔ | ✔ | ✔ | 0.9321 |  |
| Lamar Mound B (spiral mound) | mound | ✔ | ✔ | ✔ | ✔ | 0.9235 |  |
| Pond dikes (rectangular) | lookalike | ✔ | ✔ | · | · | 0.637 | urban_context:5_buildings_150m |
| L-shaped floodplain levee | lookalike | ✔ | ✔ | ✔ | · | 0.5285 |  |

## ga_etowah

- USGS 3DEP 1 m lidar DTM, 14.43 km², 238 tiles; top 50 tiles reviewed by `offline` (spend $0.0)
- raised features found: 833; after modern mask: 488; shortlisted for review: 89; passed review: 20
- recall: detected 3/3, eligible 3/3, shortlist 3/3, passed 2/3
- look-alikes flagged: detected 0/0, eligible 0/0, shortlist 0/0, passed 0/0
- false positives (no listed site within 150 m): shortlisted 86/89, passed 18/20 (1.247 per km²; precision of passed = 0.1)

| feature | label | detected | eligible | shortlist | passed | score | mask flags |
|---|---|---|---|---|---|---|---|
| Etowah Mound A | mound | ✔ | ✔ | ✔ | · | 0.7515 |  |
| Etowah Mound B (square platform E of A) | mound | ✔ | ✔ | ✔ | ✔ | 0.9325 |  |
| Etowah Mound C (platform S of A) | mound | ✔ | ✔ | ✔ | ✔ | 0.934 |  |

## ga_kolomoki

- USGS 3DEP 1 m lidar DTM, 13.13 km², 224 tiles; top 50 tiles reviewed by `offline` (spend $0.0)
- raised features found: 547; after modern mask: 523; shortlisted for review: 93; passed review: 18
- recall: detected 2/2, eligible 2/2, shortlist 2/2, passed 2/2
- look-alikes flagged: detected 0/0, eligible 0/0, shortlist 0/0, passed 0/0
- false positives (no listed site within 150 m): shortlisted 88/93, passed 15/18 (1.142 per km²; precision of passed = 0.167)

| feature | label | detected | eligible | shortlist | passed | score | mask flags |
|---|---|---|---|---|---|---|---|
| Mound A (Temple Mound) | mound | ✔ | ✔ | ✔ | ✔ | 0.9112 |  |
| Conical mound W of plaza (likely Mound D or E) | mound | ✔ | ✔ | ✔ | ✔ | 0.7447 |  |

## ga_nacoochee

- USGS 3DEP 1 m lidar DTM, 17.18 km², 304 tiles; top 50 tiles reviewed by `offline` (spend $0.0)
- raised features found: 996; after modern mask: 842; shortlisted for review: 97; passed review: 28
- recall: detected 1/1, eligible 1/1, shortlist 1/1, passed 1/1
- look-alikes flagged: detected 1/1, eligible 0/1, shortlist 0/1, passed 0/1
- false positives (no listed site within 150 m): shortlisted 96/97, passed 27/28 (1.572 per km²; precision of passed = 0.036)

| feature | label | detected | eligible | shortlist | passed | score | mask flags |
|---|---|---|---|---|---|---|---|
| Nacoochee Mound | reconstruction | ✔ | ✔ | ✔ | ✔ | 0.9283 |  |
| Rocky knoll in Helen | lookalike | ✔ | · | · | · | 0.4651 | modern:landuse:recreation_ground; urban_context:39_buildings_150m |
