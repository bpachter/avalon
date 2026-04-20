"""latency — great-circle distance to nearest internet exchange point.

Sub-score (distance to nearest IXP):
   0 mi   -> 1.00
  20 mi   -> 0.90
  50 mi   -> 0.70
 100 mi   -> 0.40
 200 mi   -> 0.10
 400+ mi  -> 0.00
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_ANCHORS = [(0.0, 1.0), (20.0, 0.9), (50.0, 0.7), (100.0, 0.4), (200.0, 0.1), (400.0, 0.0)]


def score(site) -> FactorResult:
    idx = hifld.internet_exchanges_index()
    if idx is None or not idx.points:
        return stub_result("latency", "HIFLD Internet Exchange Points")
    dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
    if dist_mi is None:
        return stub_result("latency", "HIFLD Internet Exchange Points")
    return FactorResult(
        sub_score=piecewise(dist_mi, _ANCHORS),
        provenance={
            "source": "HIFLD Internet Exchange Points",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
        },
    )
