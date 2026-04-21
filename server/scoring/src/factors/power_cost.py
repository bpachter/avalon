"""power_cost — industrial retail $/kWh.

Primary source: EIA Form 861 (live cache if available).
Fallback: embedded EIA TTM snapshot in ``scoring.src.reference_data`` — lets
the platform produce a real sub-score without running the ingest pipeline.

Sub-score (lower $ = higher score):
  $0.025/kWh -> 1.0
  $0.040     -> 0.85
  $0.060     -> 0.50
  $0.090     -> 0.20
  $0.120     -> 0.0
"""
from __future__ import annotations

from ..ingest import eia
from ..normalize import piecewise
from ..reference_data import (
    EIA_INDUSTRIAL_RETAIL_PROVENANCE,
    EIA_INDUSTRIAL_RETAIL_USD_PER_KWH,
)
from ._base import FactorResult, stub_result

_ANCHORS = [(0.025, 1.0), (0.040, 0.85), (0.060, 0.5), (0.090, 0.2), (0.120, 0.0)]


def score(site) -> FactorResult:
    state = (site.extras.get("state") or "").upper().strip()
    if not state:
        return stub_result("power_cost", "EIA-861 industrial retail price", note="site.extras.state missing")

    # Prefer live cached EIA ingest if present; otherwise fall back to embedded snapshot.
    price = eia.industrial_retail_price_usd_per_kwh(state)
    source_tag = "EIA-861 industrial retail price (TTM avg, live cache)"
    if price is None:
        price = EIA_INDUSTRIAL_RETAIL_USD_PER_KWH.get(state)
        source_tag = EIA_INDUSTRIAL_RETAIL_PROVENANCE["source"]

    if price is None:
        return stub_result(
            "power_cost",
            "EIA-861 industrial retail price",
            note=f"no price available for state {state!r}",
        )

    sub = piecewise(price, _ANCHORS)
    return FactorResult(
        sub_score=sub,
        provenance={
            "source": source_tag,
            "state": state,
            "price_usd_per_kwh": round(price, 4),
            "as_of": EIA_INDUSTRIAL_RETAIL_PROVENANCE["as_of"],
        },
    )
