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


def score(site) -> FactorResult:
    return stub_result("power_carbon", "EPA eGRID + EIA-930")
