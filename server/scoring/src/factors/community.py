"""community — siting approvals/denials, moratoria, noise ordinances.

Sources:
  - County minutes scrape
  - State PUC dockets
  - Local news graph (Tavily / RSS aggregation)
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("community", "County minutes + state PUC + news graph")
