"""Agent review stage. Only the top-N tiles from the classical pre-filter reach it.

Each candidate is shown (as an evidence image + its metrics) to several independent reviewer personas.
Each persona answers alone, without seeing the others. A candidate PASSES only if at least `min_agree`
personas say "archaeological" with confidence >= 0.5 AND the land-use checker does not call it modern
with confidence >= 0.7.

Spend control (the prod Anthropic key was drained in Sep 2026, so this is strict):
  * hard dollar cap per run (`--budget-usd`, default $0.50);
  * before EVERY call, the worst-case cost (estimated input + full max_tokens output) is checked against
    what is left; if it does not fit, the stage stops and every remaining candidate is "not_reviewed";
  * fail closed: missing key, provider error, unparseable answer, or budget stop => not passed;
  * every call is appended to out/review_ledger.jsonl with tokens and dollars.

Providers:
  * "anthropic" — Claude via the official SDK. Default model claude-haiku-5-5 (cheapest vision model).
  * "offline"   — deterministic rule-based stand-ins for the personas, $0, no network. NOT a language model;
                  used for tests and for runs without a key. Its votes are labelled `offline-rules`.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

PRICES_PER_MTOK = {  # USD (input, output) — first-party API list prices, cached 2026-11-03
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
}

REGION_CONTEXT = {
    "ga_": "Southeastern USA, Mississippian and Woodland periods: earthen platform mounds (flat-topped, often "
           "square, 2-20 m high), conical burial mounds, plazas; floodplain settings.",
    "yuc_": "Maya lowlands, Yucatán/Campeche: house platforms (0.3-2 m, rectangular), plazuela groups around a "
            "patio, temple-pyramids, causeways (sacbeob, straight raised roads), terraces, reservoirs (aguadas).",
    "cr_": "Costa Rica, pre-Columbian chiefdoms (c. 300 BCE-1500 CE): circular and rectangular mounds with river-"
           "cobble retaining walls, stone-paved causeways (calzadas) running straight for hundreds of metres, "
           "plazas, aqueducts and terraces (Guayabo-like); Diquís delta: low mounds and stone-sphere alignments "
           "on the alluvial plain. Also note colonial and modern features: banana/oil-palm drainage, roads, "
           "quarries, river levees.",
}

PERSONAS = {
    "geomorphologist": (
        "You are a sceptical geomorphologist reviewing lidar-derived terrain images. Your job is to find a "
        "natural explanation if one exists: river levees, point bars, meander scars, terrace edges, landslide "
        "toes, karst, volcanic cones, erosional knobs, tree-throw, sensor or interpolation artefacts. Only vote "
        "'archaeological' when the form is hard to explain naturally (regular plan, steep built flanks, flat "
        "top, alignment with other features)."),
    "archaeologist": (
        "You are a field archaeologist experienced with airborne lidar. Judge whether the outlined feature is "
        "plausibly a human-built earthwork of the region (mound, platform, causeway, terrace, plaza edge). You "
        "know that most lidar 'discoveries' are wrong; be calibrated, not enthusiastic."),
    "landuse": (
        "You check for modern land use: road and rail embankments, bridge abutments, building pads, graded "
        "lots, dams and pond dikes, spoil heaps, quarries, sports tracks, farm terraces, drainage ditches and "
        "berms. Vote 'modern' if the feature is likely modern, otherwise give your best verdict."),
}

TASK = """Region: {region}
Data: {source} at {res:g} m/pixel. Panels: multi-direction hillshade, local relief (red = raised), slope, \
sky-view factor. The cyan line outlines the feature the automatic filter found.
Measured: kind={kind}, height above surroundings={height_m} m, area={area_m2} m^2, flank slope (75th pct)=\
{side_slope_deg} deg, rectangularity={rectangularity}, solidity={solidity}, elongation={elongation}, \
flat-top fraction={flat_top}, regional slope={context_slope_deg} deg. Pre-filter flags: {flags}.

Answer with ONLY a JSON object, no other text:
{{"verdict": "archaeological" | "natural" | "modern" | "uncertain", "confidence": 0.0-1.0, \
"reason": "<one sentence, max 30 words>"}}"""


class BudgetExceeded(Exception):
    pass


class Ledger:
    def __init__(self, cap_usd: float, path: Path):
        self.cap = float(cap_usd)
        self.spent = 0.0
        self.calls = 0
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)

    def reserve(self, worst_usd):
        if self.spent + worst_usd > self.cap:
            raise BudgetExceeded(f"next call could cost ${worst_usd:.4f}; spent ${self.spent:.4f} of ${self.cap:.2f}")

    def record(self, entry):
        self.spent += entry["usd"]
        self.calls += 1
        with open(self.path, "a") as f:
            f.write(json.dumps(entry) + "\n")


def region_for(area_id, area_cfg):
    if area_cfg.get("region"):
        return area_cfg["region"]
    for k, v in REGION_CONTEXT.items():
        if area_id.startswith(k):
            return v
    return "unspecified region"


def _parse(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        raise ValueError("no JSON in answer")
    d = json.loads(m.group(0))
    v = str(d.get("verdict", "")).lower()
    if v not in ("archaeological", "natural", "modern", "uncertain"):
        raise ValueError(f"bad verdict {v!r}")
    return {"verdict": v, "confidence": float(d.get("confidence", 0)), "reason": str(d.get("reason", ""))[:300]}


# ----------------------------------------------------------------------------------------- providers
class OfflineProvider:
    """Rule-based stand-ins. Deterministic. Not an LLM — exists so the stage can run at $0 and be tested."""
    name = "offline-rules"
    model = "offline-rules"

    def review(self, persona, cand, image_path, ctx):
        c = cand
        coarse = ctx["res"] >= 10
        if persona == "geomorphologist":
            built = (c.side_slope_deg >= (8 if coarse else 18)) and (c.rectangularity >= 0.7 or c.solidity >= 0.9)
            hillside = c.context_slope_deg > 6
            if built and not hillside:
                return {"verdict": "archaeological", "confidence": 0.6, "reason": "steep regular flanks on flat ground"}
            return {"verdict": "natural", "confidence": 0.6 if hillside else 0.5,
                    "reason": "on a slope" if hillside else "flanks or plan not clearly built"}
        if persona == "archaeologist":
            plaus = c.kind == "mound" and c.height_m >= ctx["min_h"] * 1.5 and (
                c.rectangularity >= 0.72 or c.solidity >= 0.9)
            return {"verdict": "archaeological" if plaus else "uncertain", "confidence": 0.6 if plaus else 0.4,
                    "reason": "compact regular raised form" if plaus else "form not diagnostic"}
        if persona == "landuse":
            if any(f.startswith("modern:") for f in c.flags):
                return {"verdict": "modern", "confidence": 0.8, "reason": "overlaps mapped modern features"}
            if c.kind == "linear":
                return {"verdict": "modern", "confidence": 0.6, "reason": "long straight embankment"}
            return {"verdict": "archaeological" if c.solidity >= 0.85 else "uncertain", "confidence": 0.5,
                    "reason": "no mapped modern feature"}
        raise ValueError(persona)

    def worst_cost(self):
        return 0.0


class AnthropicProvider:
    def __init__(self, model, max_tokens=1500, price=None, effort="low"):
        import anthropic  # official SDK
        if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
            raise RuntimeError("ANTHROPIC_API_KEY not set: refusing to run the agent stage (fail closed).")
        self.client = anthropic.Anthropic()
        self.model = model
        self.name = "anthropic"
        self.max_tokens = max_tokens
        self.effort = effort
        if price is None:
            if model not in PRICES_PER_MTOK:
                raise RuntimeError(f"no price known for {model}; pass --price-in/--price-out (USD per Mtok)")
            price = PRICES_PER_MTOK[model]
        self.p_in, self.p_out = price

    def _est_input_tokens(self, image_path, text):
        from PIL import Image
        w, h = Image.open(image_path).size
        return int(w * h / 750) + len(text) // 3 + 200

    def worst_cost_for(self, image_path, text):
        return (self._est_input_tokens(image_path, text) * self.p_in + self.max_tokens * self.p_out) / 1e6

    def review(self, persona, cand, image_path, ctx, ledger=None):
        import anthropic
        text = TASK.format(region=ctx["region"], source=ctx["source"], res=ctx["res"],
                           flags=", ".join(cand.flags) or "none", **cand.to_dict())
        worst = self.worst_cost_for(image_path, PERSONAS[persona] + text)
        ledger.reserve(worst)  # raises BudgetExceeded before any spend
        img = base64.standard_b64encode(Path(image_path).read_bytes()).decode()
        t0 = time.time()
        try:
            resp = self.client.messages.create(
                model=self.model, max_tokens=self.max_tokens, system=PERSONAS[persona],
                output_config={"effort": self.effort},
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}},
                    {"type": "text", "text": text}]}],
            )
        except anthropic.APIError as e:
            ledger.record({"candidate": cand.id, "persona": persona, "model": self.model, "usd": worst,
                           "error": str(e)[:200], "note": "charged worst case on error"})
            raise
        u = resp.usage
        usd = (u.input_tokens * self.p_in + u.output_tokens * self.p_out) / 1e6
        ledger.record({"candidate": cand.id, "persona": persona, "model": self.model, "usd": round(usd, 6),
                       "in": u.input_tokens, "out": u.output_tokens, "s": round(time.time() - t0, 1)})
        if resp.stop_reason == "refusal":
            raise ValueError("refusal")
        out = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return _parse(out)


def make_provider(name, model=None, price=None):
    if name == "offline":
        return OfflineProvider()
    if name == "anthropic":
        return AnthropicProvider(model or "claude-haiku-5-5", price=price)
    raise ValueError(f"unknown provider {name}")


def decide(votes, min_agree):
    yes = [v for v in votes if v["verdict"] == "archaeological" and v["confidence"] >= 0.5]
    modern_veto = any(v["persona"] == "landuse" and v["verdict"] == "modern" and v["confidence"] >= 0.7 for v in votes)
    if len(votes) < len(PERSONAS):
        return "not_reviewed"
    if modern_veto:
        return "rejected_modern"
    return "passed" if len(yes) >= min_agree else "rejected"


def review_candidates(items, provider, ledger, ctx, min_agree=2):
    """items: list of (candidate, image_path). Mutates nothing; returns {cand_id: {'status', 'votes'}}."""
    results = {}
    stopped = None
    for cand, img in items:
        if stopped:
            results[cand.id] = {"status": "not_reviewed", "votes": [], "note": stopped}
            continue
        votes = []
        for persona in PERSONAS:
            try:
                if isinstance(provider, OfflineProvider):
                    v = provider.review(persona, cand, img, ctx)
                else:
                    v = provider.review(persona, cand, img, ctx, ledger=ledger)
            except BudgetExceeded as e:
                stopped = f"budget stop: {e}"
                break
            except Exception as e:  # fail closed: an error is never a yes
                v = {"verdict": "uncertain", "confidence": 0.0, "reason": f"error: {str(e)[:120]}"}
            v["persona"] = persona
            v["provider"] = provider.name
            votes.append(v)
        if stopped and len(votes) < len(PERSONAS):
            results[cand.id] = {"status": "not_reviewed", "votes": votes, "note": stopped}
            continue
        results[cand.id] = {"status": decide(votes, min_agree), "votes": votes}
    return results
