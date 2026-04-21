"""power_transmission — distance to ≥230 kV transmission + substation MW headroom.

Sources:
  - HIFLD Electric Power Transmission Lines (filter VOLTAGE >= 230)
  - HIFLD Electric Substations
  - FERC Form 715 (planning models) — TODO
  - ISO/RTO interconnection queues — TODO

Sub-score (piecewise on distance to nearest ≥230 kV line):
   0 mi  -> 1.00
   1 mi  -> 0.95
   5 mi  -> 0.75
  15 mi  -> 0.30
  30 mi  -> 0.00

Kill criterion: no ≥230 kV line within 15 miles.
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_DIST_ANCHORS = [(0.0, 1.0), (1.0, 0.95), (5.0, 0.75), (15.0, 0.30), (30.0, 0.0)]


def score(site) -> FactorResult:
    idx = hifld.transmission_index()
    if idx is None or not idx.points:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")
    dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
    if dist_mi is None:
        return stub_result("power_transmission", "HIFLD Transmission Lines (≥230 kV)")

    sub = piecewise(dist_mi, _DIST_ANCHORS)
    kill = dist_mi > 15.0
    return FactorResult(
        sub_score=sub,
        kill=kill,
        provenance={
            "source": "HIFLD Transmission Lines (≥230 kV)",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
            "kill_threshold_mi": 15.0,
        },
    )
