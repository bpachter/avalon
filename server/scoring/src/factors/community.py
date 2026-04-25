"""community — local community reception and opposition risk geographic proxy.

Uses state and regional heuristics to estimate community-level opposition
risk until live news-graph / county-minutes scraping is wired.

Proxy logic:
  - States with established DC clusters have normalized community acceptance
  - Dense urban areas or environmentally activist regions carry higher opposition risk
  - Rural Sun Belt / Midwest states with few prior opposition events score best
"""
from __future__ import annotations

from ._base import FactorResult

# Community reception / opposition-risk score [0=high opposition, 1=welcoming]
# Based on: historical opposition campaigns, NIMBY density, environmental
# activism levels, noise/water ordinance frequency.
_STATE_COMMUNITY: dict[str, float] = {
    # Low opposition, active welcome
    "TX": 0.88, "IA": 0.90, "OH": 0.87, "IN": 0.87, "GA": 0.86,
    "SC": 0.86, "TN": 0.86, "NC": 0.85, "KY": 0.85, "AL": 0.85,
    "MS": 0.84, "AR": 0.85, "MO": 0.84, "NE": 0.86, "KS": 0.84,
    "OK": 0.83, "SD": 0.87, "ND": 0.86, "WY": 0.86, "MT": 0.84,
    "ID": 0.83, "UT": 0.82, "NV": 0.80, "AZ": 0.82, "NM": 0.80,
    "VA": 0.82,  # NoVA is saturated but state-level is moderate
    # Moderate
    "FL": 0.78, "IL": 0.76, "MI": 0.78, "WI": 0.80, "MN": 0.78,
    "PA": 0.74, "WV": 0.82, "LA": 0.80, "CO": 0.75, "WA": 0.72,
    "OR": 0.70, "DE": 0.72, "MD": 0.70,
    # Higher opposition / activism
    "CA": 0.50, "NY": 0.52, "NJ": 0.55, "MA": 0.58, "CT": 0.60,
    "RI": 0.62, "VT": 0.65, "NH": 0.68, "ME": 0.72, "HI": 0.48,
}


def score(site) -> FactorResult:
    state = (site.extras.get("state") if hasattr(site, "extras") else None) or ""
    state = state.upper().strip()

    sub = _STATE_COMMUNITY.get(state, 0.72)

    return FactorResult(
        sub_score=sub,
        provenance={
            "source": "Geographic proxy (state community reception / opposition-risk index)",
            "note": "Proxy until county-minutes scrape + news-graph ingest is wired",
            "state": state or None,
        },
    )
