"""Evidence renders: a 2x2 panel (multi-hillshade, local relief, slope, sky-view factor) around a candidate,
plus the HTML evidence card that adds reasons and reviewer votes. Used both as the image the reviewer
personas see and as the human-facing card."""
from __future__ import annotations

import html
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from shapely import wkt  # noqa: E402

from . import terrain  # noqa: E402


def crop_bounds(dem, cand, min_size_m):
    size_m = max(min_size_m, 4 * math.sqrt(cand.area_m2))
    half = int(round(size_m / dem.res / 2))
    h, w = dem.shape
    r0, r1 = max(cand.row - half, 0), min(cand.row + half, h)
    c0, c1 = max(cand.col - half, 0), min(cand.col + half, w)
    return r0, r1, c0, c1


def render_panel(dem, layers, cand, path: Path, min_size_m=None, title=None, show_coords=False):
    if min_size_m is None:
        min_size_m = 160 if dem.res <= 2 else 4000
    r0, r1, c0, c1 = crop_bounds(dem, cand, min_size_m)
    z = layers.z[r0:r1, c0:c1]
    res = dem.res
    exag = 1.0 if res <= 2 else 3.0
    hs = terrain.multi_hillshade(z, res, exaggeration=exag)
    lrm = layers.lrm[r0:r1, c0:c1]
    slope = layers.slope[r0:r1, c0:c1]
    svf = terrain.sky_view_factor(z, res, radius_m=10 * res)
    ext = [0, (c1 - c0) * res, 0, (r1 - r0) * res]
    poly = wkt.loads(cand.geom_wkt)
    x0, y1 = dem.transform * (c0, r0)
    xs, ys = poly.exterior.coords.xy
    px = [x - x0 for x in xs]
    py = [(r1 - r0) * res - (y1 - y) for y in ys]

    fig, axes = plt.subplots(2, 2, figsize=(8, 8), dpi=100)
    lim = max(0.5, float(np.nanpercentile(np.abs(lrm), 99)))
    panels = [
        (hs, "gray", None, None, "multi-direction hillshade"),
        (lrm, "RdBu_r", -lim, lim, f"local relief (±{lim:.1f} m)"),
        (slope, "magma", 0, 40 if res <= 2 else 15, "slope (deg)"),
        (svf, "gray", float(np.percentile(svf, 2)), 1.0, "sky-view factor"),
    ]
    for ax, (img, cmap, vmin, vmax, label) in zip(axes.flat, panels):
        ax.imshow(img, cmap=cmap, vmin=vmin, vmax=vmax, extent=ext, interpolation="nearest")
        ax.plot(px, py, color="#00e5ff", lw=1.0, alpha=0.9)
        ax.set_title(label, fontsize=9)
        ax.set_xticks([])
        ax.set_yticks([])
    # scale bar
    bar = 10 ** math.floor(math.log10(ext[1] / 3))
    axes[0, 0].plot([ext[1] * 0.05, ext[1] * 0.05 + bar], [ext[3] * 0.06] * 2, color="yellow", lw=3)
    axes[0, 0].text(ext[1] * 0.05, ext[3] * 0.09, f"{bar:g} m", color="yellow", fontsize=8)
    head = title or cand.id
    sub = f"{cand.kind}  h={cand.height_m} m  area={cand.area_m2:.0f} m²  flank={cand.side_slope_deg}°  " \
          f"rect={cand.rectangularity}  sol={cand.solidity}  score={cand.score}  ({dem.source}, {res:g} m)"
    if show_coords:
        sub += f"\n{cand.lat:.5f}, {cand.lon:.5f}"
    fig.suptitle(head + "\n" + sub, fontsize=8)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def write_cards_html(cards, path: Path, title: str, private: bool):
    rows = []
    for c in cards:
        votes = "".join(
            f"<li><b>{html.escape(v['persona'])}</b>: {html.escape(v['verdict'])} ({v.get('confidence', 0):.2f}) — "
            f"{html.escape(v.get('reason', ''))}</li>" for v in c.get("votes", []))
        loc = f"<p class=loc>{c['lat']:.5f}, {c['lon']:.5f} (EXACT — do not share)</p>" if private else \
              f"<p class=loc>cell {html.escape(c.get('cell', ''))}</p>"
        rows.append(f"""<section><h2>{html.escape(c['id'])} — {html.escape(c.get('status', ''))}</h2>
<img src="{html.escape(c['image'])}" alt="evidence panel for {html.escape(c['id'])}">
{loc}<p>score {c['score']} · tile {html.escape(c['tile'])} · flags: {html.escape(', '.join(c.get('flags', [])) or 'none')}</p>
<h3>Why the pre-filter picked it</h3><ul>{''.join(f'<li>{html.escape(r)}</li>' for r in c.get('reasons', []))}</ul>
<h3>Reviewer votes</h3><ul>{votes or '<li>not reviewed</li>'}</ul></section>""")
    banner = ("<p class=warn>PRIVATE: exact locations of possible archaeological sites. For the Museo Nacional / "
              "authorities only. Do not publish, post, or share.</p>") if private else ""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"""<!doctype html><meta charset=utf-8><title>{html.escape(title)}</title>
<style>body{{font:14px system-ui;max-width:900px;margin:2em auto;padding:0 1em}}img{{max-width:100%}}
section{{border-top:1px solid #ccc;padding:1em 0}}.warn{{background:#fee;border:1px solid #c00;padding:.5em}}
.loc{{font-family:monospace}}</style><h1>{html.escape(title)}</h1>{banner}{''.join(rows)}""")
    (path.with_suffix(".json")).write_text(json.dumps(cards, indent=1))
    return path
