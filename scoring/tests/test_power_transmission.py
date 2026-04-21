from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch

# Make `import src.*` resolve when running from repo root.
_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src import score as scoring  # noqa: E402
from src.factors import power_transmission  # noqa: E402


class _FakeTxIndex:
    points = [(35.0, -79.0)]
    geojson_path = pathlib.Path("/tmp/transmission.geojson")

    def nearest_distance_mi(self, lat: float, lon: float) -> float:
        return 4.0


class _FakeSubIndex:
    geojson_path = pathlib.Path("/tmp/substations.geojson")


class PowerTransmissionFactorTests(unittest.TestCase):
    def test_combines_line_substation_and_queue_signals(self):
        site = scoring.Site("X", 35.2, -79.2)
        fake_substations = [
            (35.2, -79.2, {"NAME": "Wake Hub", "MAX_VOLT": 500, "LINES": 8}),
            (36.0, -80.0, {"NAME": "Far Sub", "MAX_VOLT": 115, "LINES": 1}),
        ]
        with (
            patch("src.factors.power_transmission.hifld.transmission_index", return_value=_FakeTxIndex()),
            patch("src.factors.power_transmission.hifld.substations", return_value=fake_substations),
            patch("src.factors.power_transmission.hifld.substations_index", return_value=_FakeSubIndex()),
            patch(
                "src.factors.power_transmission.iso_queues.congestion_metrics",
                return_value={
                    "nearest_project_distance_mi": 14.0,
                    "nearest_project_iso": "PJM",
                    "nearest_project_id": "Q-1",
                    "nearest_project_mw": 450.0,
                    "nearest_project_status": "active",
                    "active_mw_50mi": 2200.0,
                    "pending_mw_50mi": 1800.0,
                    "active_mw_100mi": 5600.0,
                    "pending_mw_100mi": 6100.0,
                    "project_count_100mi": 21,
                    "withdrawn_share_100mi": 0.19,
                },
            ),
            patch(
                "src.factors.power_transmission.iso_queues.provenance",
                return_value={"source": "ISO queue cache", "as_of": "2026-04-21"},
            ),
        ):
            res = power_transmission.score(site)

        self.assertFalse(res.kill)
        self.assertGreater(res.sub_score, 0.0)
        self.assertIn("line_distance_sub_score", res.provenance)
        self.assertIn("substation_headroom_proxy", res.provenance)
        self.assertIn("queue_score", res.provenance)
        self.assertEqual(res.provenance.get("substation_name"), "Wake Hub")

    def test_falls_back_to_line_only_when_substations_missing(self):
        site = scoring.Site("Y", 35.2, -79.2)
        with (
            patch("src.factors.power_transmission.hifld.transmission_index", return_value=_FakeTxIndex()),
            patch("src.factors.power_transmission.hifld.substations", return_value=[]),
            patch("src.factors.power_transmission.hifld.substations_index", return_value=None),
            patch("src.factors.power_transmission.iso_queues.congestion_metrics", return_value=None),
        ):
            res = power_transmission.score(site)

        self.assertIn("substation_note", res.provenance)
        self.assertIsNone(res.provenance.get("substation_headroom_proxy"))
        self.assertIsNone(res.provenance.get("queue_score"))


if __name__ == "__main__":
    unittest.main()
