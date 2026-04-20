"""gas_pipeline — distance to interstate transmission gas pipelines.

Hyperscalers are deploying behind-the-meter gas turbines (and looking at
SMRs) for firm power; pipeline access matters even where grid power is
the primary source.

Sub-score (closer = better):
   0 mi  -> 1.0
   2 mi  -> 0.9
  10 mi  -> 0.5
  30 mi  -> 0.1
  60+ mi -> 0.0
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_ANCHORS = [(0.0, 1.0), (2.0, 0.9), (10.0, 0.5), (30.0, 0.1), (60.0, 0.0)]


def score(site) -> FactorResult:
    idx = hifld.natgas_pipelines_index()
    if idx is None or not idx.points:
        return stub_result("gas_pipeline", "HIFLD Natural Gas Pipelines")
    dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
    if dist_mi is None:
        return stub_result("gas_pipeline", "HIFLD Natural Gas Pipelines")
    return FactorResult(
        sub_score=piecewise(dist_mi, _ANCHORS),
        provenance={
            "source": "HIFLD Natural Gas Pipelines",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
        },
    )
