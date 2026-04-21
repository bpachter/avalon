"""power_carbon — generation-mix carbon intensity (gCO2/kWh).

Sources:
  - EIA-930 hourly balancing-authority generation mix
  - EPA eGRID subregion emission factors

Sub-score (lower carbon = higher score):
   50  gCO2/kWh -> 1.0
  300            -> 0.6
  600            -> 0.2
  900+           -> 0.0
"""
from __future__ import annotations

from ._base import FactorResult, stub_result
from ..normalize import piecewise
from ..reference_data import EPA_EGRID_CO2_G_PER_KWH, EPA_EGRID_PROVENANCE


# Sub-score ramp (lower gCO2/kWh = better):
#   50  -> 1.00
#  200  -> 0.80
#  400  -> 0.50
#  600  -> 0.20
#  800+ -> 0.00
_ANCHORS = [(50.0, 1.0), (200.0, 0.8), (400.0, 0.5), (600.0, 0.2), (800.0, 0.0)]


def score(site) -> FactorResult:
    state = (site.extras.get("state") or "").upper().strip()
    if not state:
        return stub_result("power_carbon", "EPA eGRID + EIA-930", note="site.extras.state missing")
    g = EPA_EGRID_CO2_G_PER_KWH.get(state)
    if g is None:
        return stub_result("power_carbon", "EPA eGRID + EIA-930", note=f"no eGRID value for {state!r}")
    sub = piecewise(float(g), _ANCHORS)
    return FactorResult(
        sub_score=sub,
        provenance={
            "source": EPA_EGRID_PROVENANCE["source"],
            "state": state,
            "co2_g_per_kwh": float(g),
            "as_of": EPA_EGRID_PROVENANCE["as_of"],
        },
    )
