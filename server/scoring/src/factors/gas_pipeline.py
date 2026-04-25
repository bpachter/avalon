"""gas_pipeline — distance to interstate transmission gas pipelines + pipeline attributes.

Hyperscalers are deploying behind-the-meter gas turbines (and looking at
SMRs) for firm power; pipeline access matters even where grid power is
the primary source.

Sub-score (closer = better):
   0 mi  -> 1.0
   2 mi  -> 0.9
  10 mi  -> 0.5
  30 mi  -> 0.1
  60+ mi -> 0.0

Provenance enrichment (when cache available):
  - Pipeline name, operator, type, diameter (inches)
  - Estimated lateral tap length + order-of-magnitude connection cost
"""
from __future__ import annotations

from ..ingest import hifld
from ..normalize import piecewise
from ._base import FactorResult, stub_result

_ANCHORS = [(0.0, 1.0), (2.0, 0.9), (10.0, 0.5), (30.0, 0.1), (60.0, 0.0)]

# Rough cost per mile for a gas lateral tap (2024 USD)
# High-pressure large-diameter: ~$1M-3M/mile onshore; we use midpoint by diameter bucket
_GAS_LATERAL_COST_PER_MILE_BY_DIAMETER = {
    "large":  2_000_000,  # >= 24"
    "medium": 1_200_000,  # 12-23"
    "small":    700_000,  # < 12"
    "unknown":  1_500_000,
}


def _diameter_bucket(diameter_str: str | None) -> str:
    if not diameter_str:
        return "unknown"
    try:
        d = float(diameter_str)
        if d >= 24:
            return "large"
        if d >= 12:
            return "medium"
        return "small"
    except (ValueError, TypeError):
        return "unknown"


def score(site) -> FactorResult:
    idx = hifld.natgas_pipelines_index()
    if idx is None or not idx.points:
        return stub_result("gas_pipeline", "HIFLD Natural Gas Pipelines")

    nearest = idx.nearest_with_properties(site.lat, site.lon)
    if nearest is None:
        return stub_result("gas_pipeline", "HIFLD Natural Gas Pipelines")

    dist_mi, props = nearest

    pipeline_name = props.get("Pipename") or props.get("NAME") or "Unknown"
    operator = props.get("Operator") or props.get("OPERATOR") or "Unknown"
    pipe_type = props.get("TYPEPIPE") or props.get("TYPE") or "Unknown"
    diameter_str = str(props.get("Diameter") or props.get("DIAMETER") or "")
    diameter_str = diameter_str.strip()

    d_bucket = _diameter_bucket(diameter_str)
    cost_per_mi = _GAS_LATERAL_COST_PER_MILE_BY_DIAMETER[d_bucket]
    lateral_cost_low = int(dist_mi * cost_per_mi * 0.7)
    lateral_cost_high = int(dist_mi * cost_per_mi * 1.5)

    return FactorResult(
        sub_score=piecewise(dist_mi, _ANCHORS),
        provenance={
            "source": "HIFLD Natural Gas Pipelines",
            "cache_path": str(idx.geojson_path),
            "nearest_distance_mi": round(dist_mi, 3),
            "pipeline_name": pipeline_name,
            "pipeline_operator": operator,
            "pipeline_type": pipe_type,
            "pipeline_diameter_in": diameter_str or None,
            "lateral_cost_per_mile_usd": cost_per_mi,
            "lateral_tap_cost_est_low_usd": lateral_cost_low,
            "lateral_tap_cost_est_high_usd": lateral_cost_high,
        },
    )

