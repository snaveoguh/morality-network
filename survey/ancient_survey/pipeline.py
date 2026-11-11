"""End-to-end run for one area: fetch -> layers -> detect -> masks -> tile scores -> top-N review -> outputs."""
from __future__ import annotations

import json
import math
import time
import tomllib
from pathlib import Path

from shapely import wkt
from shapely.geometry import box, mapping

from . import detect, mask, render, review, sources

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
PUBLIC_CELL_DEG = 0.05   # ~5.5 km at the equator: public outputs never carry anything finer


def load_areas():
    return tomllib.loads((ROOT / "areas.toml").read_text())["areas"]


def reasons_for(c, min_h):
    r = [f"raised {c.height_m} m above its surroundings (threshold {min_h} m)"]
    if c.side_slope_deg >= 18:
        r.append(f"steep flanks ({c.side_slope_deg}°), typical of built earthworks")
    if c.rectangularity >= 0.75:
        r.append(f"rectangular plan (fills {c.rectangularity:.0%} of its bounding rectangle)")
    elif c.solidity >= 0.9:
        r.append(f"compact rounded plan (solidity {c.solidity})")
    if c.flat_top >= 0.15:
        r.append(f"flat summit ({c.flat_top:.0%} of footprint)")
    if c.context_slope_deg <= 2:
        r.append(f"on flat ground (regional slope {c.context_slope_deg}°), where natural knobs are rarer")
    if c.kind == "mound" and c.closure >= 0.9:
        r.append(f"stands clear of its surroundings on all sides ({c.closure:.0%} of the ring around it is lower)")
    if c.kind == "linear":
        r.append(f"long straight raised feature (elongation {c.elongation}): causeway, levee, terrace or road fill")
    return r


def public_cell(lon, lat):
    i, j = math.floor(lon / PUBLIC_CELL_DEG), math.floor(lat / PUBLIC_CELL_DEG)
    return f"{i}_{j}", box(i * PUBLIC_CELL_DEG, j * PUBLIC_CELL_DEG, (i + 1) * PUBLIC_CELL_DEG, (j + 1) * PUBLIC_CELL_DEG)


def run(area_id, top_n=50, per_tile=2, provider="offline", model=None, budget_usd=0.50, min_agree=2,
        known_sites=None, price=None, use_modern_mask=True, log=print):
    areas = load_areas()
    a = areas[area_id]
    t0 = time.time()
    privdir = OUT / "private" / area_id

    log(f"[{area_id}] fetching {a['source']} …")
    dem = sources.fetch_area(a)
    log(f"[{area_id}] DTM {dem.shape} at {dem.res} m ({dem.source}); layers …")
    layers = detect.compute_layers(dem, a["lrm_scales_m"])
    cands = detect.detect(dem, layers, a, area_id)
    min_h = float(a.get("min_height_m", 0.5))
    for c in cands:
        c.reasons = reasons_for(c, min_h)
    log(f"[{area_id}] {len(cands)} raised features found by the classical filter")

    # masks
    mm = None
    if use_modern_mask:
        try:
            mm = mask.ModernMask(mask.load_modern(a["bbox"], area_id), dem.crs)
            log(f"[{area_id}] modern mask: {mm.counts}")
        except Exception as e:  # keep going, but say so on every candidate
            log(f"[{area_id}] modern mask unavailable: {e}")
    mask.apply_modern(cands, mm)
    known_paths = list(known_sites or [])
    if a["kind"] == "survey" and not known_paths:
        known_paths = [str(p) for p in (ROOT / "known_sites").glob("*.csv")]
    known = mask.load_known_sites(known_paths)
    mask.apply_known(cands, known, dem.crs)

    eligible = [c for c in cands if not any(f.startswith(("modern:", "known_site:")) for f in c.flags)]
    tiles = detect.score_tiles(dem, eligible, a["tile_m"], area_id)
    # candidates outside `eligible` still need a tile id for reporting
    detect.score_tiles(dem, [c for c in cands if c not in eligible], a["tile_m"], area_id)
    top_tiles = tiles[:top_n]
    by_tile = {}
    for c in sorted(eligible, key=lambda c: -c.score):
        by_tile.setdefault(c.tile, []).append(c)
    to_review = [c for t in top_tiles for c in by_tile.get(t["tile"], [])[:per_tile]]
    log(f"[{area_id}] {len(eligible)} eligible after masks; reviewing {len(to_review)} candidates "
        f"from the top {len(top_tiles)} of {len(tiles)} tiles with provider={provider}")

    # evidence images (private: they show the exact terrain)
    items = []
    for c in to_review:
        p = render.render_panel(dem, layers, c, privdir / "cards" / f"{c.id}.png")
        items.append((c, p))

    ctx = {"region": review.region_for(area_id, a), "source": dem.source, "res": dem.res, "min_h": min_h}
    ledger = review.Ledger(budget_usd, OUT / "private" / "review_ledger.jsonl")
    try:
        prov = review.make_provider(provider, model, price)
        results = review.review_candidates(items, prov, ledger, ctx, min_agree=min_agree)
    except RuntimeError as e:  # e.g. no key: fail closed, nothing passes
        log(f"[{area_id}] review stage refused: {e}")
        results = {c.id: {"status": "not_reviewed", "votes": [], "note": str(e)} for c, _ in items}

    # outputs
    cards, feats = [], []
    for c, img in items:
        res = results.get(c.id, {"status": "not_reviewed", "votes": []})
        cell, _ = public_cell(c.lon, c.lat)
        cards.append({**{k: v for k, v in c.to_dict().items() if k != "geom_wkt"}, "status": res["status"],
                      "votes": res["votes"], "image": f"cards/{img.name}", "cell": cell})
    for c in cands:
        st = results.get(c.id, {}).get("status", "not_selected" if c in eligible else "masked")
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c.lon, 6), round(c.lat, 6)]},
                      "properties": {**{k: v for k, v in c.to_dict().items() if k not in ("geom_wkt", "lon", "lat", "x", "y", "row", "col")},
                                     "status": st}})
    render.write_cards_html(cards, privdir / "cards.html", f"Evidence cards — {area_id} (PRIVATE)", private=True)
    priv = {"type": "FeatureCollection", "name": f"{area_id} candidates (PRIVATE, exact)",
            "warning": "Exact locations. Never publish. For the Museo Nacional / competent authority only.",
            "features": feats}
    (privdir / "candidates_private.geojson").write_text(json.dumps(priv))
    (privdir / "tiles.json").write_text(json.dumps(tiles))

    summary = {
        "area": area_id, "kind": a["kind"], "source": dem.source, "res_m": dem.res, "bbox": a["bbox"],
        "area_km2": round(dem.shape[0] * dem.shape[1] * dem.res ** 2 / 1e6, 2),
        "n_tiles": len(tiles), "n_raised_features": len(cands), "n_eligible": len(eligible),
        "n_masked_modern": sum(any(f.startswith("modern:") for f in c.flags) for c in cands),
        "n_masked_known": sum(any(f.startswith("known_site:") for f in c.flags) for c in cands),
        "modern_mask": mm.counts if mm else None, "top_n_tiles": len(top_tiles), "n_reviewed": len(items),
        "review_provider": provider if provider == "offline" else f"{provider}:{model or 'claude-haiku-5-5'}",
        "review_status_counts": _count(r["status"] for r in results.values()),
        "spend_usd": round(ledger.spent, 4), "budget_usd": budget_usd, "runtime_s": round(time.time() - t0, 1),
    }
    (privdir / "summary.json").write_text(json.dumps(summary, indent=1))
    log(f"[{area_id}] done: {summary['review_status_counts']} spend ${summary['spend_usd']}")
    return {"dem": dem, "layers": layers, "cands": cands, "eligible": eligible, "tiles": tiles,
            "top_tiles": top_tiles, "reviewed": to_review, "results": results, "summary": summary, "cards": cards}


def _count(it):
    d = {}
    for x in it:
        d[x] = d.get(x, 0) + 1
    return d


def write_combined(runs):
    """out/candidates_private.geojson (exact, gitignored) and out/candidates_public.geojson (5 km cells only,
    survey areas only, only candidates that passed review)."""
    priv, cells = [], {}
    for r in runs:
        s = r["summary"]
        for c in r["reviewed"]:
            st = r["results"].get(c.id, {}).get("status", "not_reviewed")
            priv.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c.lon, 7), round(c.lat, 7)]},
                         "properties": {"id": c.id, "area": s["area"], "status": st, "score": c.score, "kind": c.kind,
                                        "height_m": c.height_m, "area_m2": c.area_m2, "flags": c.flags,
                                        "outline_utm_wkt": c.geom_wkt, "utm_epsg": r["dem"].crs}})
            # Public cells only for survey areas, only for candidates passed by a real reviewer panel.
            # Offline rule stand-ins are a test harness, not review: their passes never go public.
            if s["kind"] != "survey" or st != "passed" or s["review_provider"] == "offline":
                continue
            key, geom = public_cell(c.lon, c.lat)
            cell = cells.setdefault(key, {"geom": geom, "n": 0, "best": 0.0, "areas": set()})
            cell["n"] += 1
            cell["best"] = max(cell["best"], c.score)
            cell["areas"].add(s["area"])
    OUT.mkdir(exist_ok=True)
    (OUT / "candidates_private.geojson").write_text(json.dumps({
        "type": "FeatureCollection", "name": "candidates (PRIVATE, exact)",
        "warning": "Exact locations. Never publish. Gitignored. For the Museo Nacional / competent authority only.",
        "features": priv}))
    pub = {"type": "FeatureCollection", "name": "ancient-survey candidates (public, coarse)",
           "note": (f"Each feature is a {PUBLIC_CELL_DEG}° (~5 km) grid cell containing at least one candidate that "
                    "passed agent review. No exact positions are published, to protect possible sites from looting. "
                    "Candidates are unverified desk results, not discoveries."),
           "features": [{"type": "Feature", "geometry": mapping(v["geom"]),
                         "properties": {"cell": k, "n_candidates": v["n"], "best_score": round(v["best"], 2),
                                        "areas": sorted(v["areas"])}} for k, v in sorted(cells.items())],
           "runs": [{"area": r["summary"]["area"], "source": r["summary"]["source"], "res_m": r["summary"]["res_m"],
                     "review_provider": r["summary"]["review_provider"],
                     "status_counts": r["summary"]["review_status_counts"]} for r in runs if r["summary"]["kind"] == "survey"]}
    if not cells:
        pub["note"] += (" EMPTY: no survey candidate has passed a real (model-backed) review yet. Runs without a model"
                        " use offline rule stand-ins, whose passes are never published.")
    (OUT / "candidates_public.geojson").write_text(json.dumps(pub, indent=1))
    return pub
