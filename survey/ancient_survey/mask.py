"""Masks: (1) modern structures from Overture Maps (OpenStreetMap-derived buildings, roads, rail, land use),
(2) already-registered/known archaeological sites from CSV lists.

Overture Maps is read straight from its public S3 bucket as GeoParquet with a bbox filter (no API, no key).
Licence: ODbL (OSM-derived layers) / CDLA-Permissive (others); see DATA.md.
If Overture is unreachable, the run continues with no modern mask and every candidate carries flag
`modern_mask_unavailable` so nobody mistakes an unmasked list for a masked one.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from pyproj import Transformer
from shapely import wkb, wkt
from shapely.geometry import Point
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree

from .sources import DATA

OVERTURE_RELEASE = "2026-10-21.0"
OVERTURE = "overturemaps-us-west-2/release/{rel}/theme={theme}/type={type}/"

ROAD_HALF_WIDTH_M = {  # half of a typical road-plus-embankment footprint
    "motorway": 25, "trunk": 18, "primary": 14, "secondary": 12, "tertiary": 10, "residential": 8,
    "unclassified": 8, "service": 6, "track": 5, "living_street": 6, "path": 2, "footway": 2,
}
RAIL_HALF_WIDTH_M = 12
MODERN_LANDUSE = {
    "quarry", "landfill", "industrial", "construction", "brownfield", "works", "pitch", "track", "stadium",
    "golf_course", "fairway", "green", "bunker", "tee", "salt_pond", "aquaculture", "military", "commercial",
    "retail", "railway", "garages", "dam", "recreation_ground",
}


def _overture_query(theme, type_, bbox, columns):
    import pyarrow.compute as pc
    import pyarrow.dataset as ds
    import pyarrow.fs as fs
    s3 = fs.S3FileSystem(anonymous=True, region="us-west-2")
    d = ds.dataset(OVERTURE.format(rel=OVERTURE_RELEASE, theme=theme, type=type_), filesystem=s3, format="parquet")
    w, s, e, n = bbox
    f = (pc.field("bbox", "xmax") > w) & (pc.field("bbox", "xmin") < e) & \
        (pc.field("bbox", "ymax") > s) & (pc.field("bbox", "ymin") < n)
    return d.to_table(columns=columns, filter=f).to_pylist()


def load_modern(bbox, area_id):
    """Returns {'buildings': [...], 'roads': [(geom, half_width)], 'landuse': [(geom, class)]} in WGS84, cached."""
    cache = DATA / "overture" / f"{area_id}.json"
    if cache.exists():
        raw = json.loads(cache.read_text())
    else:
        raw = {"buildings": [], "roads": [], "landuse": []}
        for r in _overture_query("buildings", "building", bbox, ["geometry"]):
            raw["buildings"].append(wkb.loads(r["geometry"]).wkt)
        for r in _overture_query("transportation", "segment", bbox, ["geometry", "subtype", "class"]):
            if r["subtype"] == "rail":
                hw = RAIL_HALF_WIDTH_M
            elif r["subtype"] == "road":
                hw = ROAD_HALF_WIDTH_M.get(r["class"] or "", 6)
            else:
                continue
            raw["roads"].append([wkb.loads(r["geometry"]).wkt, hw])
        for typ in ("land_use", "infrastructure"):
            for r in _overture_query("base", typ, bbox, ["geometry", "class"]):
                if (r["class"] or "") in MODERN_LANDUSE:
                    raw["landuse"].append([wkb.loads(r["geometry"]).wkt, r["class"]])
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(raw))
    return raw


class ModernMask:
    """Projected-coordinate mask. A candidate is flagged modern when:
       - >= 25 % of its outline is covered by building footprints (+3 m), or
       - >= 35 % is inside a road/rail corridor (half-width by class), or
       - its centroid is inside a modern land-use polygon (quarry, landfill, industrial, sports pitch, ...)."""

    def __init__(self, raw, epsg):
        t = Transformer.from_crs(4326, epsg, always_xy=True).transform
        self.buildings = [shp_transform(t, wkt.loads(g)).buffer(3) for g in raw["buildings"]]
        self.roads = [shp_transform(t, wkt.loads(g)).buffer(hw) for g, hw in raw["roads"]]
        self.landuse = [(shp_transform(t, wkt.loads(g)), c) for g, c in raw["landuse"]]
        self._b = STRtree(self.buildings) if self.buildings else None
        self._r = STRtree(self.roads) if self.roads else None
        self._l = STRtree([g for g, _ in self.landuse]) if self.landuse else None
        self.counts = {"buildings": len(self.buildings), "road_rail_segments": len(self.roads),
                       "modern_landuse": len(self.landuse)}

    def _cover(self, tree, geoms, poly):
        if tree is None:
            return 0.0
        idx = tree.query(poly)
        if len(idx) == 0:
            return 0.0
        u = unary_union([geoms[i] for i in idx])
        return poly.intersection(u).area / poly.area if poly.area else 0.0

    def urban_context(self, poly, radius_m=150):
        """Number of mapped buildings within `radius_m`: graded pads and spoil cluster in built-up land."""
        if self._b is None:
            return 0
        return int(len(self._b.query(poly.centroid.buffer(radius_m))))

    def check(self, poly):
        flags = []
        b = self._cover(self._b, self.buildings, poly)
        if b >= 0.25:
            flags.append(f"modern:building({b:.0%})")
        r = self._cover(self._r, self.roads, poly)
        if r >= 0.35:
            flags.append(f"modern:road_or_rail_corridor({r:.0%})")
        if self._l is not None:
            c = poly.centroid
            for i in self._l.query(c):
                g, cls = self.landuse[i]
                if g.contains(c):
                    flags.append(f"modern:landuse:{cls}")
                    break
        return flags


def apply_modern(cands, mask):
    """Flags candidates on mapped modern features, and down-weights (does not drop) candidates in built-up
    surroundings: score x (1 - 0.4 * ramp(buildings within 150 m, 2..15))."""
    for c in cands:
        if mask is None:
            c.flags.append("modern_mask_unavailable")
            continue
        poly = wkt.loads(c.geom_wkt)
        c.flags.extend(mask.check(poly))
        nb = mask.urban_context(poly)
        if nb > 2:
            f = 1 - 0.4 * min(max((nb - 2) / 13, 0), 1)
            c.score = round(c.score * f, 4)
            c.flags.append(f"urban_context:{nb}_buildings_150m")


def load_known_sites(paths):
    rows = []
    for p in paths:
        p = Path(p)
        if not p.exists():
            continue
        for r in csv.DictReader(open(p, newline="")):
            rows.append({"name": r.get("name") or r.get("feature") or r.get("site"),
                         "lat": float(r["lat"]), "lon": float(r["lon"]),
                         "radius_m": float(r.get("radius_m") or 150), "source": str(p.name)})
    return rows


def apply_known(cands, known, epsg):
    if not known:
        return
    t = Transformer.from_crs(4326, epsg, always_xy=True)
    pts = []
    for k in known:
        x, y = t.transform(k["lon"], k["lat"])
        pts.append((Point(x, y).buffer(k["radius_m"]), k["name"]))
    for c in cands:
        p = Point(c.x, c.y)
        for g, name in pts:
            if g.contains(p):
                c.flags.append(f"known_site:{name}")
                break
