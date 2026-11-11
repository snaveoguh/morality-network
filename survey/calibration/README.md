# Calibration ground truth

## `ga_mounds_verified.csv` — Georgia platform mounds and look-alikes

Copied unchanged from [kbranchuser/archaeohub-ga-mound-detector](https://github.com/kbranchuser/archaeohub-ga-mound-detector)
(`data/ga_mounds_verified.csv`, MIT licence, © 2026 Kelob Branch). Every row is at a **public state or national park**
(Ocmulgee Mounds NHP, Etowah, Kolomoki, Lamar, Nacoochee, Rock Eagle/Rock Hawk) and was checked against USGS 3DEP 1 m lidar
by that project. No DINAA or restricted site-file coordinates are used.

How the pipeline uses it (`ancient_survey/validate.py`):

| `label` | role |
|---|---|
| `mound` | **positive** — recall is measured on these |
| `reconstruction` | positive (rebuilt mound; still a mound-shaped earthwork in the DTM) |
| `lookalike` | **known negative** — modern/natural features that resemble mounds; we report how many we wrongly flag |
| `earthwork`, `effigy` | excluded (ditches and stone effigies are not what the detector looks for) |

The sites at Etowah and Kolomoki have more mounds than are listed here, so "candidates that match nothing" in those areas
are an upper bound on false positives, not an exact count.

## Maya calibration (G-LiHT, Campeche transect l2s502)

`maya_calibration.csv` holds the one published, transect-specific known site used by the
[sen2008/maya-lidar-pilot](https://github.com/sen2008/maya-lidar-pilot) pilot: Šprajc (2026) nested complex #1
(18.3354 N, 91.1130 W), published as detected on G-LiHT transect l2s502. It is already public in the literature.
The run needs the G-LiHT tile, which the build sandbox could not reach (see `../DATA.md`).
