"""fiber — long-haul fiber proximity, route diversity, peering distance.

Sub-score (distance to nearest long-haul route):
   0 mi  -> 1.00
   1 mi  -> 0.95
   5 mi  -> 0.70
  15 mi  -> 0.35
  25 mi  -> 0.10
  50 mi  -> 0.00

Kill criterion: no long-haul route within 25 miles.
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.7), (15.0, 0.35), (25.0, 0.1), (50.0, 0.0)]


def score(site) -> FactorResult:
    idx = hifld.longhaul_fiber_index()
    if idx is None or not idx.points:
        return stub_result("fiber", "HIFLD Long-haul Fiber")
    dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
    if dist_mi is None:
        return stub_result("fiber", "HIFLD Long-haul Fiber")
    sub = piecewise(dist_mi, _DIST_ANCHORS)
    kill = dist_mi > 25.0
    return FactorResult(
        sub_score=sub,
        kill=kill,
        provenance={
            "source": "HIFLD Long-haul Fiber",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
            "kill_threshold_mi": 25.0,
        },
    )
