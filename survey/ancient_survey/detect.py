"""Classical pre-filter: no LLM, no GPU. Finds locally raised, regular, steep-sided features and scores them.

Pipeline per area:
  DTM -> multiscale local relief (LRM) -> threshold -> connected components (blobs)
  -> per-blob shape/height metrics -> rule score in [0, 1] -> tile scores.

What the rules encode (and why):
  * height above surroundings — earthworks stand clear of the micro-relief
  * steep sides — built mounds/platforms have 15-35 deg flanks; natural swells and levees are gentler
  * regular plan — square/rectangular platforms (high rectangularity), round mounds (high solidity)
  * flat summit — platform mounds have plateaus; conical mounds do not (bonus, not required)
  * flat context — a compact rise on a floodplain or plateau is rarer naturally than a knob on a dissected hillside
  * linear class — long, narrow, straight raised features (causeways, levees, terrace risers, road embankments)
These are deliberately simple and auditable. The agent review stage, not this one, has to tell a mound from a road fill.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np
from rasterio import features as rfeatures
from scipy import ndimage
from shapely.geometry import shape

from . import terrain


@dataclass
class Candidate:
    id: str
    kind: str                 # "mound" | "linear"
    row: int
    col: int
    x: float                  # projected centroid
    y: float
    lon: float
    lat: float
    area_m2: float
    height_m: float
    side_slope_deg: float
    rectangularity: float
    solidity: float
    elongation: float
    flat_top: float
    context_slope_deg: float
    closure: float
    score: float
    tile: str = ""
    geom_wkt: str = ""        # projected outline (private only)
    flags: list = field(default_factory=list)
    reasons: list = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


@dataclass
class Layers:
    z: np.ndarray
    nan: np.ndarray
    lrm: np.ndarray
    slope: np.ndarray
    context_slope: np.ndarray


def compute_layers(dem, scales_m):
    z, nan = terrain.fill_nan(dem.z)
    lrm = terrain.multiscale_lrm(z, dem.res, scales_m)
    slope = terrain.slope_deg(z, dem.res)
    # Regional slope of a heavily smoothed surface: "is this on a hillside?"
    sigma = max(2.0, 2 * max(scales_m) / dem.res)
    context = terrain.slope_deg(ndimage.gaussian_filter(z, sigma), dem.res)
    lrm[nan] = 0
    return Layers(z, nan, lrm, slope, context)


def _sat(v, lo, hi):
    return float(np.clip((v - lo) / (hi - lo), 0.0, 1.0))


def score_blob(height, min_h, side_slope, rect, solidity, elong, flat_top, context_slope, kind, coarse):
    h_score = 1 - math.exp(-max(height - min_h, 0) / (1.5 * min_h))
    # At 30 m resolution flank slopes are smeared; relax the steepness ramp.
    steep = _sat(side_slope, 2, 12) if coarse else _sat(side_slope, 5, 22)
    regular = max(_sat(rect, 0.62, 0.85), _sat(solidity, 0.80, 0.95))
    ctx = 1 - _sat(context_slope, 2, 12)
    if kind == "linear":
        straight = _sat(rect, 0.55, 0.85)
        return 0.25 * h_score + 0.25 * steep + 0.30 * straight + 0.20 * ctx
    return 0.25 * h_score + 0.25 * steep + 0.20 * regular + 0.10 * flat_top + 0.20 * ctx


def detect(dem, layers, area_cfg, area_id):
    res = dem.res
    min_h = float(area_cfg.get("min_height_m", 0.5))
    coarse = res >= 10
    min_area = float(area_cfg.get("min_area_m2", 60 if not coarse else 4 * res * res))
    max_area = float(area_cfg.get("max_area_m2", 60000 if not coarse else 2.0e6))

    raised = layers.lrm > min_h
    raised = ndimage.binary_opening(raised, iterations=1 if coarse else 2)
    lab, n = ndimage.label(raised)
    objs = ndimage.find_objects(lab)
    out = []
    from pyproj import Transformer
    to_ll = Transformer.from_crs(dem.crs, 4326, always_xy=True)
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        # pad the crop so flanks and the surrounding ring are included
        k_out = 3 if coarse else max(4, int(round(12 / res)))
        pad = k_out + 3
        r0, r1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, lab.shape[0])
        c0, c1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, lab.shape[1])
        m = lab[r0:r1, c0:c1] == i
        npx = int(m.sum())
        area = npx * res * res
        if area < min_area or area > max_area:
            continue
        lrm = layers.lrm[r0:r1, c0:c1]
        slope = layers.slope[r0:r1, c0:c1]
        height = float(lrm[m].max())
        # flank = ring just inside + just outside the outline
        ring = ndimage.binary_dilation(m, iterations=2) & ~ndimage.binary_erosion(m, iterations=1)
        side = float(np.percentile(slope[ring], 75)) if ring.any() else 0.0
        # closure: is it lower all the way round? A built mound is; a spur between two gullies is joined to
        # higher ground on one side, a terrace edge on one side, a levee along its length.
        zc = layers.z[r0:r1, c0:c1]
        outer = ndimage.binary_dilation(m, iterations=k_out) & ~ndimage.binary_dilation(m, iterations=2)
        ztop = float(zc[m].max())
        closure = float((zc[outer] < ztop - 0.5 * height).mean()) if outer.any() else 0.0
        top = m & (lrm > 0.6 * height)
        flat_top = float(((slope < (8 if not coarse else 3)) & top).sum() / max(npx, 1))
        # outline polygon in projected coordinates
        from rasterio.transform import Affine
        t = dem.transform * Affine.translation(c0, r0)
        polys = [shape(g) for g, v in rfeatures.shapes(m.astype("uint8"), mask=m, transform=t) if v == 1]
        if not polys:
            continue
        poly = max(polys, key=lambda p: p.area)
        hull = poly.convex_hull
        mrr = poly.minimum_rotated_rectangle
        solidity = poly.area / hull.area if hull.area else 0
        rect = poly.area / mrr.area if mrr.area else 0
        xs, ys = mrr.exterior.coords.xy
        e1 = math.hypot(xs[1] - xs[0], ys[1] - ys[0])
        e2 = math.hypot(xs[2] - xs[1], ys[2] - ys[1])
        elong = max(e1, e2) / max(min(e1, e2), res)
        kind = "linear" if (elong >= 4 and min(e1, e2) <= (40 if not coarse else 300)) else "mound"
        rr, cc = np.nonzero(m)
        row, col = int(rr.mean()) + r0, int(cc.mean()) + c0
        ctx = float(layers.context_slope[row, col])
        sc = score_blob(height, min_h, side, rect, solidity, elong, flat_top, ctx, kind, coarse)
        if kind == "mound":
            sc *= 0.5 + 0.5 * _sat(closure, 0.6, 0.95)
        cx, cy = poly.centroid.x, poly.centroid.y
        lon, lat = to_ll.transform(cx, cy)
        out.append(Candidate(
            id=f"{area_id}-{len(out) + 1:05d}", kind=kind, row=row, col=col, x=cx, y=cy, lon=lon, lat=lat,
            area_m2=round(area, 1), height_m=round(height, 2), side_slope_deg=round(side, 1),
            rectangularity=round(rect, 3), solidity=round(solidity, 3), elongation=round(elong, 2),
            flat_top=round(flat_top, 3), context_slope_deg=round(ctx, 1), closure=round(closure, 3), score=round(sc, 4),
            geom_wkt=poly.simplify(res / 2).wkt,
        ))
    return out


def score_tiles(dem, cands, tile_m, area_id):
    """Every tile gets a score: best candidate + small bonus for clusters (settlements come in groups)."""
    tpx = max(1, int(round(tile_m / dem.res)))
    h, w = dem.shape
    nr, nc = math.ceil(h / tpx), math.ceil(w / tpx)
    by_tile = {}
    for c in cands:
        tr, tc = c.row // tpx, c.col // tpx
        c.tile = f"{area_id}/t{tr:03d}_{tc:03d}"
        by_tile.setdefault(c.tile, []).append(c)
    tiles = []
    for tr in range(nr):
        for tc in range(nc):
            key = f"{area_id}/t{tr:03d}_{tc:03d}"
            cs = sorted(by_tile.get(key, []), key=lambda c: -c.score)
            strong = [c for c in cs if c.score >= 0.5]
            s = (cs[0].score if cs else 0.0) + 0.04 * min(max(len(strong) - 1, 0), 5)
            tiles.append({"tile": key, "row": tr, "col": tc, "score": round(s, 4), "n_candidates": len(cs),
                          "n_strong": len(strong), "best": cs[0].id if cs else None})
    tiles.sort(key=lambda t: -t["score"])
    return tiles
