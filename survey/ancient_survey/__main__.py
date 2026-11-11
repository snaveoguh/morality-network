"""CLI.

  python -m ancient_survey list
  python -m ancient_survey run AREA [AREA ...] [--provider offline|anthropic] [--model M] [--top-n 50]
                                    [--per-tile 2] [--budget-usd 0.50] [--min-agree 2] [--known-sites a.csv ...]
  python -m ancient_survey validate [AREA ...]      # calibration areas; default: all reachable ones
"""
from __future__ import annotations

import argparse
import json
import sys

from . import pipeline, validate


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ancient_survey")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    for name in ("run", "validate"):
        p = sub.add_parser(name)
        p.add_argument("areas", nargs="*")
        p.add_argument("--provider", default="offline", choices=["offline", "anthropic"])
        p.add_argument("--model", default=None, help="default claude-haiku-5-5 for provider=anthropic")
        p.add_argument("--price-in", type=float, help="USD per million input tokens (unknown models)")
        p.add_argument("--price-out", type=float, help="USD per million output tokens (unknown models)")
        p.add_argument("--top-n", type=int, default=50, help="tiles sent to the agent stage")
        p.add_argument("--per-tile", type=int, default=2, help="candidates reviewed per top tile")
        p.add_argument("--budget-usd", type=float, default=0.50, help="hard cap for the whole run (fail closed)")
        p.add_argument("--min-agree", type=int, default=2, help="personas that must say archaeological")
        p.add_argument("--known-sites", nargs="*", default=None, help="extra known-site CSVs (private paths ok)")
        p.add_argument("--no-modern-mask", action="store_true")
    a = ap.parse_args(argv)
    areas = pipeline.load_areas()
    if a.cmd == "list":
        for k, v in areas.items():
            print(f"{k:28s} {v['kind']:12s} {v['source']:8s} {v['bbox']}")
        return 0
    price = (a.price_in, a.price_out) if a.price_in is not None and a.price_out is not None else None
    if a.cmd == "run":
        names = a.areas or [k for k, v in areas.items() if v["kind"] == "survey"]
    else:
        names = a.areas or [k for k, v in areas.items() if v["kind"] == "calibration"]
    runs, evals = [], []
    remaining = a.budget_usd
    for name in names:
        try:
            r = pipeline.run(name, top_n=a.top_n, per_tile=a.per_tile, provider=a.provider, model=a.model,
                             budget_usd=remaining, min_agree=a.min_agree, known_sites=a.known_sites, price=price,
                             use_modern_mask=not a.no_modern_mask)
        except Exception as e:
            print(f"[{name}] SKIPPED: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        remaining = max(0.0, remaining - r["summary"]["spend_usd"])  # one cap across all areas in the run
        runs.append(r)
        if a.cmd == "validate":
            evals.append(validate.evaluate(r))
    if runs:
        pipeline.write_combined(runs)
    if evals:
        tag = a.provider if a.provider == "offline" else (a.model or "claude-haiku-5-5")
        validate.write_report(evals, pipeline.OUT / f"validation_{tag}.md", pipeline.OUT / f"validation_{tag}.json",
                              f"Calibration results — review provider `{tag}`")
        for e in evals:
            print(json.dumps({k: e[k] for k in ("area", "recall", "lookalikes_flagged", "false_positives")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
