"""power_cost — industrial retail $/kWh (EIA Form 861).

For now we use state-level industrial retail price. When ISO LMP feeds
land we'll blend the two: locational marginal pricing for the wholesale
component, retail for the all-in tariff comparison.

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
from ._base import FactorResult, stub_result

_ANCHORS = [(0.025, 1.0), (0.040, 0.85), (0.060, 0.5), (0.090, 0.2), (0.120, 0.0)]


def score(site) -> FactorResult:
    state = (site.extras.get("state") or "").upper().strip()
    if not state:
        return stub_result("power_cost", "EIA-861 industrial retail price", note="site.extras.state missing")

    price = eia.industrial_retail_price_usd_per_kwh(state)
    if price is None:
        return stub_result("power_cost", "EIA-861 industrial retail price", note=f"no cached price for {state}")

    sub = piecewise(price, _ANCHORS)
    return FactorResult(
        sub_score=sub,
        provenance={
            "source": "EIA-861 industrial retail price (TTM avg)",
            "state": state,
            "price_usd_per_kwh": round(price, 4),
        },
    )
