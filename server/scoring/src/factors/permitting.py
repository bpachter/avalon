"""permitting — county track record on data-center permits + moratorium scan.

Sources:
  - County permit portals (where digitally available)
  - State PUC dockets (interconnection-related approvals)
  - News graph + county minutes scrape for moratoria
"""
from __future__ import annotations

from ._base import FactorResult, stub_result


def score(site) -> FactorResult:
    return stub_result("permitting", "County portals + state PUC dockets + news")
