"""water — water availability and aquifer stress geographic proxy.

Uses longitude/latitude and state-level heuristics as a geographic proxy
until USGS NWIS + NOAA Drought Monitor ingest is wired.

Proxy logic:
  - Western states (lon < -100) score lower due to chronic water scarcity
  - Specific high-stress states (AZ, NV, NM, UT, CO) penalized further
  - Great Lakes basin states bonus (WI, MI, IN, OH, IL, MN, NY, PA)
  - Southeast / Appalachian corridor is well-watered
  - Latitude gradient: far south (hot evaporation) slightly penalized
"""
from __future__ import annotations

from ..normalize import piecewise
from ._base import FactorResult

# State-level water stress multipliers (1.0 = neutral)
_STATE_STRESS: dict[str, float] = {
    # Critical scarcity
    "NV": 0.20, "AZ": 0.25, "NM": 0.30, "UT": 0.35, "CO": 0.45,
    "CA": 0.50, "WY": 0.55, "ID": 0.60, "MT": 0.65, "OR": 0.70,
    # Great Lakes / water-rich
    "MI": 0.95, "WI": 0.92, "MN": 0.90, "OH": 0.88, "IN": 0.87,
    "IL": 0.86, "NY": 0.85, "PA": 0.84, "WV": 0.88,
    # Southeast water-rich
    "GA": 0.82, "SC": 0.83, "NC": 0.82, "VA": 0.83, "TN": 0.84,
    "AL": 0.80, "MS": 0.80, "AR": 0.80, "LA": 0.82, "FL": 0.78,
    # Central / moderate
    "TX": 0.65, "OK": 0.62, "KS": 0.58, "NE": 0.62, "SD": 0.65,
    "ND": 0.68, "IA": 0.78, "MO": 0.80, "KY": 0.82,
    # Northeast
    "CT": 0.82, "MA": 0.82, "RI": 0.80, "VT": 0.88, "NH": 0.87,
    "ME": 0.90, "NJ": 0.78, "MD": 0.80, "DE": 0.78,
    # Mid-west
    "WA": 0.72,
}

# Longitude-based aridity baseline (West = more arid)
_LON_ANCHORS = [(-125.0, 0.40), (-110.0, 0.50), (-100.0, 0.65), (-90.0, 0.78), (-75.0, 0.85), (-65.0, 0.85)]


def score(site) -> FactorResult:
    state = (site.extras.get("state") if hasattr(site, "extras") else None) or ""
    state = state.upper().strip()

    lon_score = piecewise(site.lon, _LON_ANCHORS)
    state_mult = _STATE_STRESS.get(state, 0.75)

    sub = round(max(0.0, min(1.0, lon_score * (state_mult / 0.75))), 4)

    return FactorResult(
        sub_score=sub,
        provenance={
            "source": "Geographic proxy (longitude aridity + state water stress)",
            "note": "Proxy until USGS NWIS + NOAA Drought Monitor ingest is wired",
            "state": state or None,
            "lon_score": round(lon_score, 4),
            "state_multiplier": state_mult,
        },
    )
