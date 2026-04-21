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

from ..geo import nearest_distance_mi
from ..ingest import hifld
from ..normalize import piecewise
from ..reference_data import US_MAJOR_IXPS, US_MAJOR_IXPS_PROVENANCE
from ._base import FactorResult, stub_result

_ANCHORS = [(0.0, 1.0), (20.0, 0.9), (50.0, 0.7), (100.0, 0.4), (200.0, 0.1), (400.0, 0.0)]

# Embedded fallback: (lat, lon) of major US IXPs, used when HIFLD cache is absent.
_IXP_POINTS: list[tuple[float, float]] = [(lat, lon) for _, lat, lon in US_MAJOR_IXPS]


def score(site) -> FactorResult:
    idx = hifld.internet_exchanges_index()
    if idx is not None and idx.points:
        dist_mi = idx.nearest_distance_mi(site.lat, site.lon)
        source = "HIFLD Internet Exchange Points (live cache)"
        path = str(idx.geojson_path)
    else:
        dist_mi = nearest_distance_mi(site.lat, site.lon, _IXP_POINTS)
        source = US_MAJOR_IXPS_PROVENANCE["source"]
        path = None

    if dist_mi is None:
        return stub_result("latency", "HIFLD Internet Exchange Points")

    prov: dict = {
        "source": source,
        "nearest_distance_mi": round(dist_mi, 3),
        "n_ixps_considered": len(idx.points) if idx else len(_IXP_POINTS),
    }
    if path:
        prov["cache_path"] = path
    else:
        prov["as_of"] = US_MAJOR_IXPS_PROVENANCE["as_of"]

    return FactorResult(sub_score=piecewise(dist_mi, _ANCHORS), provenance=prov)
