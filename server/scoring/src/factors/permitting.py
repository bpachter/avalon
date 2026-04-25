"""permitting — data-center permitting climate geographic proxy.

Uses state-level heuristics (regulatory environment, moratoria history,
environmental review burden) as a proxy until live county/PUC ingest.

Known moratoria / heavy-restriction states/regions are penalized.
Business-friendly low-regulation states with active DC corridors score best.
"""
from __future__ import annotations

from ._base import FactorResult

# State permitting climate for large industrial/DC facilities [0, 1]
# Reflects: CEQA/SEPA burden, historical approval rates, moratoria risk,
# utility interconnection queue ease, local opposition patterns.
_STATE_PERMITTING: dict[str, float] = {
    # Highly favorable — low regulation, active DC corridors
    "TX": 0.92, "VA": 0.90, "GA": 0.88, "OH": 0.88, "IA": 0.87,
    "IN": 0.87, "TN": 0.86, "NC": 0.86, "SC": 0.85, "KY": 0.85,
    "AL": 0.84, "MS": 0.83, "AR": 0.83, "MO": 0.83, "NE": 0.84,
    "KS": 0.83, "OK": 0.82, "SD": 0.85, "ND": 0.84, "WY": 0.85,
    "MT": 0.83, "ID": 0.82, "UT": 0.84, "NV": 0.82, "AZ": 0.83,
    "NM": 0.80, "CO": 0.78, "FL": 0.80,
    # Moderate
    "IL": 0.78, "MI": 0.78, "WI": 0.78, "MN": 0.76, "PA": 0.76,
    "WV": 0.82, "LA": 0.80, "WA": 0.72, "OR": 0.70,
    # Challenging — higher regulatory burden
    "NY": 0.55, "NJ": 0.58, "CA": 0.45, "MA": 0.60, "CT": 0.62,
    "RI": 0.62, "MD": 0.65, "DE": 0.68, "NH": 0.70, "VT": 0.68,
    "ME": 0.72, "HI": 0.50,
}


def score(site) -> FactorResult:
    state = (site.extras.get("state") if hasattr(site, "extras") else None) or ""
    state = state.upper().strip()

    sub = _STATE_PERMITTING.get(state, 0.72)

    return FactorResult(
        sub_score=sub,
        provenance={
            "source": "Geographic proxy (state permitting climate index)",
            "note": "Proxy until county permit portals + state PUC docket ingest is wired",
            "state": state or None,
        },
    )
