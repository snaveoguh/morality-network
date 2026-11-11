"""Recall / false-positive measurement against known sites in calibration areas.

Stages a known feature can reach:
  detected  — the classical filter outlined a raised feature within `match_m` of it
  eligible  — that feature survived the modern-structure mask
  shortlist — it is among the candidates sent to review (top-N tiles x per-tile)
  passed    — the reviewer personas agreed it is archaeological

Positives = label in {mound, reconstruction}. Known negatives = label 'lookalike'.
False positives = passed (or shortlisted) candidates farther than `site_m` from every listed archaeological
feature. In areas where not every mound is listed this is an upper bound.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from pyproj import Transformer
from shapely import wkt
from shapely.geometry import Point

from .pipeline import OUT, ROOT

POSITIVE = {"mound", "reconstruction"}
ARCH = {"mound", "reconstruction", "earthwork", "effigy"}
GT_FILES = [ROOT / "calibration" / "ga_mounds_verified.csv", ROOT / "calibration" / "maya_calibration.csv"]


def load_truth(bbox):
    w, s, e, n = bbox
    rows = []
    for p in GT_FILES:
        for r in csv.DictReader(open(p, newline="")):
            lat, lon = float(r["lat"]), float(r["lon"])
            if w < lon < e and s < lat < n:
                rows.append({**r, "lat": lat, "lon": lon})
    return rows


def evaluate(run, match_m=40.0, site_m=150.0):
    s = run["summary"]
    dem = run["dem"]
    truth = load_truth(s["bbox"])
    t = Transformer.from_crs(4326, dem.crs, always_xy=True)
    polys = [(c, wkt.loads(c.geom_wkt)) for c in run["cands"]]
    eligible = {c.id for c in run["eligible"]}
    shortlist = {c.id for c in run["reviewed"]}
    passed = {cid for cid, r in run["results"].items() if r["status"] == "passed"}

    def stage_of(pt):
        near = [c for c, g in polys if g.distance(pt) <= match_m]
        st = {"detected": bool(near), "eligible": any(c.id in eligible for c in near),
              "shortlist": any(c.id in shortlist for c in near), "passed": any(c.id in passed for c in near)}
        best = max(near, key=lambda c: c.score) if near else None
        return st, best

    rows, arch_pts = [], []
    for r in truth:
        pt = Point(*t.transform(r["lon"], r["lat"]))
        if r["label"] in ARCH:
            arch_pts.append(pt)
        st, best = stage_of(pt)
        rows.append({"feature": r["feature"], "label": r["label"], **st,
                     "score": best.score if best else None, "flags": best.flags if best else []})

    def frac(label_set, stage):
        sel = [x for x in rows if x["label"] in label_set]
        return (sum(x[stage] for x in sel), len(sel))

    def unmatched(ids):
        out = 0
        for c, g in polys:
            if c.id in ids and all(g.distance(p) > site_m for p in arch_pts):
                out += 1
        return out

    stages = ["detected", "eligible", "shortlist", "passed"]
    res = {
        "area": s["area"], "source": s["source"], "area_km2": s["area_km2"], "n_tiles": s["n_tiles"],
        "top_n_tiles": s["top_n_tiles"], "n_raised_features": s["n_raised_features"], "n_eligible": s["n_eligible"],
        "n_shortlist": len(shortlist), "n_passed": len(passed), "review_provider": s["review_provider"],
        "spend_usd": s["spend_usd"], "match_m": match_m,
        "recall": {st: frac(POSITIVE, st) for st in stages},
        "lookalikes_flagged": {st: frac({"lookalike"}, st) for st in stages},
        "false_positives": {
            "shortlist_unmatched": unmatched(shortlist), "passed_unmatched": unmatched(passed),
            "passed_unmatched_per_km2": round(unmatched(passed) / max(s["area_km2"], 1e-9), 3),
            "precision_passed": None if not passed else round(1 - unmatched(passed) / len(passed), 3),
        },
        "rows": rows,
    }
    return res


def write_report(results, path_md: Path, path_json: Path, title):
    path_json.write_text(json.dumps(results, indent=1))
    L = [f"# {title}", ""]
    tot = {k: [0, 0] for k in ("detected", "eligible", "shortlist", "passed")}
    look = {k: [0, 0] for k in tot}
    for r in results:
        for k in tot:
            tot[k][0] += r["recall"][k][0]
            tot[k][1] += r["recall"][k][1]
            look[k][0] += r["lookalikes_flagged"][k][0]
            look[k][1] += r["lookalikes_flagged"][k][1]
    L += ["## Totals (all calibration areas)", "",
          "| stage | known mounds caught (recall) | known look-alikes flagged |", "|---|---|---|"]
    for k in tot:
        a, b = tot[k]
        c, d = look[k]
        L.append(f"| {k} | {a}/{b} ({a / b:.0%}) | {c}/{d} ({(c / d if d else 0):.0%}) |" if b else f"| {k} | – | – |")
    L.append("")
    for r in results:
        fp = r["false_positives"]
        L += [f"## {r['area']}", "",
              f"- {r['source']}, {r['area_km2']} km², {r['n_tiles']} tiles; top {r['top_n_tiles']} tiles reviewed by "
              f"`{r['review_provider']}` (spend ${r['spend_usd']})",
              f"- raised features found: {r['n_raised_features']}; after modern mask: {r['n_eligible']}; "
              f"shortlisted for review: {r['n_shortlist']}; passed review: {r['n_passed']}",
              f"- recall: " + ", ".join(f"{k} {v[0]}/{v[1]}" for k, v in r["recall"].items()),
              f"- look-alikes flagged: " + ", ".join(f"{k} {v[0]}/{v[1]}" for k, v in r["lookalikes_flagged"].items()),
              f"- false positives (no listed site within 150 m): shortlisted {fp['shortlist_unmatched']}/"
              f"{r['n_shortlist']}, passed {fp['passed_unmatched']}/{r['n_passed']} "
              f"({fp['passed_unmatched_per_km2']} per km²; precision of passed = {fp['precision_passed']})", "",
              "| feature | label | detected | eligible | shortlist | passed | score | mask flags |",
              "|---|---|---|---|---|---|---|---|"]
        for x in r["rows"]:
            yn = lambda b: "✔" if b else "·"  # noqa: E731
            L.append(f"| {x['feature']} | {x['label']} | {yn(x['detected'])} | {yn(x['eligible'])} | "
                     f"{yn(x['shortlist'])} | {yn(x['passed'])} | {x['score'] if x['score'] is not None else ''} | "
                     f"{'; '.join(x['flags'])} |")
        L.append("")
    path_md.write_text("\n".join(L))
