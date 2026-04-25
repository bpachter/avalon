from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch


_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import server.main as main  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class StateBoundaryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        main._STATE_BOUNDARY_CACHE.clear()
        main._STATE_BOUNDARY_NEG_CACHE.clear()
        main._STATE_POLYGON_CACHE.clear()

    def tearDown(self) -> None:
        main._STATE_BOUNDARY_CACHE.clear()
        main._STATE_BOUNDARY_NEG_CACHE.clear()
        main._STATE_POLYGON_CACHE.clear()

    def test_empty_boundary_response_is_not_persisted(self):
        empty_fc = {"type": "FeatureCollection", "features": []}
        success_fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"STUSAB": "NC", "NAME": "North Carolina"},
                    "geometry": {"type": "Polygon", "coordinates": []},
                }
            ],
        }

        with (
            patch("server.main.time.time", side_effect=[0.0, main._STATE_BOUNDARY_NEG_TTL_SEC + 1.0, main._STATE_BOUNDARY_NEG_TTL_SEC + 2.0]),
            patch.object(main._HTTP_SESSION, "get", side_effect=[_FakeResponse(200, empty_fc), _FakeResponse(200, success_fc)]) as mock_get,
        ):
            first = main._state_boundary_fc("NC")
            second = main._state_boundary_fc("NC")
            third = main._state_boundary_fc("NC")

        self.assertEqual(mock_get.call_count, 2)
        self.assertEqual(first["features"], [])
        self.assertEqual(len(second["features"]), 1)
        self.assertEqual(len(third["features"]), 1)
        self.assertIn("NC", main._STATE_BOUNDARY_CACHE)
        self.assertNotIn("NC", main._STATE_BOUNDARY_NEG_CACHE)


if __name__ == "__main__":
    unittest.main()