"""land_zoning — industrial zoning availability geographic proxy.

Uses state and regional heuristics as a proxy until county-level GIS
and EPA Brownfields ingest is wired.

Proxy logic:
  - States with active data-center development corridors score higher
  - Dense coastal metros (NYC, SF Bay) have constrained industrial land
  - Sun Belt states with greenfield availability score well
  - Rust Belt / Midwest has abundance of industrial parcels
"""
from __future__ import annotations

from ._base import FactorResult

# State-level industrial land availability proxy [0, 1]
_STATE_ZONING: dict[str, float] = {
    # Top DC corridors — abundant industrial/flex land
    "TX": 0.90, "OH": 0.88, "IA": 0.87, "GA": 0.86, "IN": 0.86,
    "VA": 0.84, "NC": 0.85, "TN": 0.85, "SC": 0.84, "KY": 0.84,
    "AL": 0.83, "MS": 0.82, "AR": 0.82, "MO": 0.83, "KS": 0.82,
    "NE": 0.82, "OK": 0.80, "SD": 0.80, "ND": 0.80, "WY": 0.82,
    "MT": 0.82, "ID": 0.80, "NM": 0.78, "UT": 0.80, "CO": 0.78,
    "AZ": 0.80, "NV": 0.78,
    # Moderate — growing markets with some constraint
    "IL": 0.80, "MI": 0.80, "WI": 0.80, "MN": 0.80, "PA": 0.78,
    "WV": 0.82, "FL": 0.76, "LA": 0.80,
    # Constrained — permitting + land cost headwinds
    "CA": 0.50, "NY": 0.52, "NJ": 0.55, "MA": 0.58, "CT": 0.58,
    "RI": 0.60, "MD": 0.65, "WA": 0.68, "OR": 0.68, "HI": 0.40,
    "DE": 0.65, "NH": 0.70, "VT": 0.72, "ME": 0.75,
}


def score(site) -> FactorResult:
    state = (site.extras.get("state") if hasattr(site, "extras") else None) or ""
    state = state.upper().strip()

    sub = _STATE_ZONING.get(state, 0.72)

    return FactorResult(
        sub_score=sub,
        provenance={
            "source": "Geographic proxy (state industrial land availability index)",
            "note": "Proxy until county GIS + EPA Brownfields ingest is wired",
            "state": state or None,
        },
    )
