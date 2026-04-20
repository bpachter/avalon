"""Factor sub-score modules.

Each factor exposes a callable `score(site) -> FactorResult` that returns
a sub-score in [0,1] (1 = best) plus optional kill flag and provenance.

Factors share `FactorResult` from `_base` to avoid circular imports.
Any factor whose ingest hasn't been implemented yet returns NaN with a
`stub=True` provenance tag — the scorer imputes the cohort median.
"""
from __future__ import annotations

from typing import Callable

from ._base import FactorResult, stub_result
from . import (
    climate,
    community,
    fiber,
    gas_pipeline,
    hazard,
    labor,
    land_zoning,
    latency,
    permitting,
    power_carbon,
    power_cost,
    power_transmission,
    tax_incentives,
    water,
)


__all__ = ["FactorResult", "stub_result", "FACTOR_REGISTRY"]


FACTOR_REGISTRY: dict[str, Callable] = {
    "power_transmission": power_transmission.score,
    "power_cost":         power_cost.score,
    "power_carbon":       power_carbon.score,
    "gas_pipeline":       gas_pipeline.score,
    "fiber":              fiber.score,
    "water":              water.score,
    "climate":            climate.score,
    "hazard":             hazard.score,
    "land_zoning":        land_zoning.score,
    "tax_incentives":     tax_incentives.score,
    "permitting":         permitting.score,
    "latency":            latency.score,
    "labor":              labor.score,
    "community":          community.score,
}
