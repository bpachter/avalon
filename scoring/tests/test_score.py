"""Minimal regression tests for the Avalon scoring engine.

Goals (kept deliberately small):
  1. The scoring engine imports without optional/missing deps blowing up.
  2. Sample sites produce a non-flat composite distribution now that
     power_cost, power_carbon, latency, and tax_incentives are wired.
  3. Weight overrides renormalize to 1.0 and change the composite.
  4. to_dict() emits the `factors`, `imputed`, `lat`, and `lon` fields
     the UI contract depends on.
  5. stub_coverage() reports < 1.0 for factors we implemented.

Run: `python -m pytest scoring/tests/` or `python -m unittest discover scoring/tests`.
"""
from __future__ import annotations

import math
import pathlib
import sys
import unittest

# Make `import src.score` resolve when running from repo root.
_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src import score as scoring  # noqa: E402
from src import config  # noqa: E402


SAMPLE_SITES = [
    scoring.Site("TX-ABL-001", 32.4487, -99.7331, {"state": "TX"}),
    scoring.Site("VA-LDN-001", 39.0840, -77.6555, {"state": "VA"}),
    scoring.Site("WA-QCY-001", 47.2343, -119.8521, {"state": "WA"}),
    scoring.Site("CA-LAX-001", 34.0522, -118.2437, {"state": "CA"}),
    scoring.Site("WV-CHA-001", 38.3498, -81.6326, {"state": "WV"}),
]


class ScoringEngineTests(unittest.TestCase):
    def test_engine_imports_and_scores(self):
        results = scoring.score_sites(SAMPLE_SITES, archetype="training")
        self.assertEqual(len(results), len(SAMPLE_SITES))
        for r in results:
            self.assertTrue(0.0 <= r.composite <= 10.0)

    def test_composite_is_not_flat(self):
        """With 4 real factors implemented, the sample cohort must
        produce a non-degenerate composite distribution."""
        results = scoring.score_sites(SAMPLE_SITES, archetype="training")
        composites = [r.composite for r in results]
        spread = max(composites) - min(composites)
        self.assertGreater(spread, 0.1, f"composite range too flat: {composites}")

    def test_to_dict_contract(self):
        [r] = scoring.score_sites([SAMPLE_SITES[0]], archetype="training")
        d = r.to_dict()
        for key in ("site_id", "lat", "lon", "composite", "factors", "imputed"):
            self.assertIn(key, d)
        self.assertIsInstance(d["factors"], dict)
        self.assertEqual(set(d["factors"].keys()), set(config.FACTOR_NAMES))
        for fname, f in d["factors"].items():
            self.assertIn("normalized", f)
            self.assertIn("weight", f)
            self.assertIn("weighted", f)
            self.assertIn("stub", f)

    def test_weight_overrides_renormalize_and_affect_composite(self):
        base = scoring.score_sites(SAMPLE_SITES, archetype="training")[0].composite
        # Boost only tax_incentives heavily — should change the composite.
        overridden = scoring.score_sites(
            SAMPLE_SITES,
            archetype="training",
            weight_overrides={"tax_incentives": 0.50},
        )[0]
        self.assertAlmostEqual(sum(overridden.weights_used.values()), 1.0, places=6)
        self.assertNotAlmostEqual(overridden.composite, base, places=3)

    def test_stub_coverage_reports_implemented_factors(self):
        results = scoring.score_sites(SAMPLE_SITES, archetype="training")
        cov = scoring.stub_coverage(results)
        implemented = ("power_cost", "power_carbon", "latency", "tax_incentives")
        for f in implemented:
            self.assertLess(
                cov[f], 1.0,
                f"{f} still fully stubbed (coverage={cov[f]})",
            )

    def test_nan_free_sub_scores(self):
        results = scoring.score_sites(SAMPLE_SITES, archetype="training")
        for r in results:
            for v in r.sub_scores.values():
                self.assertFalse(math.isnan(v), "post-imputation sub-scores must be finite")


if __name__ == "__main__":
    unittest.main()
