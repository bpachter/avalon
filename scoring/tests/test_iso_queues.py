from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch

# Make `import src.*` resolve when running from repo root.
_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from src.ingest import iso_queues  # noqa: E402


class IsoQueueIngestTests(unittest.TestCase):
    def test_fallback_projects_available(self):
        with patch("src.ingest.iso_queues.latest_cache", return_value=None):
            projects = iso_queues.queue_projects()
        self.assertGreaterEqual(len(projects), 10)
        self.assertTrue(all("iso" in p and "lat" in p and "lon" in p for p in projects))

    def test_congestion_metrics_shape(self):
        fake_projects = [
            {
                "queue_id": "PJM-1", "iso": "PJM", "status": "active", "mw": 400.0,
                "lat": 39.0, "lon": -77.5,
            },
            {
                "queue_id": "PJM-2", "iso": "PJM", "status": "pending", "mw": 700.0,
                "lat": 39.2, "lon": -77.4,
            },
            {
                "queue_id": "PJM-3", "iso": "PJM", "status": "withdrawn", "mw": 300.0,
                "lat": 39.1, "lon": -77.6,
            },
        ]
        with patch("src.ingest.iso_queues.queue_projects", return_value=fake_projects):
            m = iso_queues.congestion_metrics(39.05, -77.5)

        self.assertIsNotNone(m)
        assert m is not None
        self.assertIn("nearest_project_distance_mi", m)
        self.assertIn("active_mw_100mi", m)
        self.assertIn("pending_mw_100mi", m)
        self.assertIn("withdrawn_share_100mi", m)
        self.assertGreaterEqual(m["project_count_100mi"], 1)

    def test_filter_by_iso(self):
        fake_projects = [
            {"queue_id": "1", "iso": "PJM", "status": "active", "mw": 200.0, "lat": 39.0, "lon": -77.0},
            {"queue_id": "2", "iso": "ERCOT", "status": "active", "mw": 300.0, "lat": 31.0, "lon": -97.0},
        ]
        with patch("src.ingest.iso_queues.queue_projects", return_value=fake_projects):
            pjm = iso_queues.queue_for_iso("PJM")
        self.assertGreater(len(pjm), 0)
        self.assertTrue(all(r["iso"] == "PJM" for r in pjm))


if __name__ == "__main__":
    unittest.main()
