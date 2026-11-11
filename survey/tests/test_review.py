"""Spend-control and decision tests for the agent stage. Run: python -m pytest tests -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from ancient_survey import review  # noqa: E402
from ancient_survey.detect import Candidate  # noqa: E402


def cand(i=1):
    return Candidate(id=f"t-{i}", kind="mound", row=0, col=0, x=0, y=0, lon=0, lat=0, area_m2=900, height_m=3,
                     side_slope_deg=25, rectangularity=0.8, solidity=0.95, elongation=1.2, flat_top=0.3,
                     context_slope_deg=0.5, closure=1.0, score=0.9, geom_wkt="POINT (0 0)")


class FakePaid:
    """Behaves like a paid provider: reserves worst case, records actual cost."""
    name = "fake"

    def __init__(self, worst, actual, answer):
        self.worst, self.actual, self.answer, self.calls = worst, actual, answer, 0

    def review(self, persona, c, img, ctx, ledger=None):
        ledger.reserve(self.worst)
        self.calls += 1
        ledger.record({"usd": self.actual})
        if isinstance(self.answer, Exception):
            raise self.answer
        return dict(self.answer)


def test_budget_stops_before_overspend(tmp_path):
    led = review.Ledger(0.10, tmp_path / "l.jsonl")
    p = FakePaid(worst=0.03, actual=0.02, answer={"verdict": "archaeological", "confidence": 0.9, "reason": ""})
    res = review.review_candidates([(cand(i), None) for i in range(5)], p, led, {}, min_agree=2)
    assert led.spent <= 0.10
    assert p.calls == 4  # 4 x 0.02 = 0.08 spent; the 5th call's worst case (0.03) would pass the cap
    statuses = [r["status"] for r in res.values()]
    assert statuses[0] == "passed" and statuses.count("not_reviewed") == 4


def test_errors_fail_closed(tmp_path):
    led = review.Ledger(1.0, tmp_path / "l.jsonl")
    p = FakePaid(worst=0.0, actual=0.0, answer=RuntimeError("boom"))
    res = review.review_candidates([(cand(), None)], p, led, {}, min_agree=1)
    assert res["t-1"]["status"] == "rejected"


def test_modern_veto():
    votes = [{"persona": "geomorphologist", "verdict": "archaeological", "confidence": 0.9},
             {"persona": "archaeologist", "verdict": "archaeological", "confidence": 0.9},
             {"persona": "landuse", "verdict": "modern", "confidence": 0.8}]
    assert review.decide(votes, 2) == "rejected_modern"


def test_no_key_refuses(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    pytest.importorskip("anthropic")
    with pytest.raises(RuntimeError):
        review.make_provider("anthropic")


def test_parse_rejects_garbage():
    with pytest.raises(ValueError):
        review._parse("I think it is a mound")
    assert review._parse('ok {"verdict": "natural", "confidence": 0.7, "reason": "levee"}')["verdict"] == "natural"
