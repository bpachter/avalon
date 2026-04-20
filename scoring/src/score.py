"""Composite scorer — combines all factor sub-scores into a single 0-10 number.

Workflow per site:
  1. Each factor module returns FactorResult(sub_score in [0,1] or NaN, kill_flag, provenance).
  2. NaN sub-scores are imputed to the cohort median (per-factor) before weighting.
  3. Weighted sum × 10 = composite, unless any kill_flag is True → composite = 0.
  4. Result includes per-factor breakdown and provenance for full auditability.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

import numpy as np

from . import config
from .factors import FACTOR_REGISTRY, FactorResult


@dataclass
class SiteScore:
    site_id: str
    composite: float  # 0-10
    archetype: str
    sub_scores: dict[str, float]  # factor -> [0,1] (post-imputation)
    raw_sub_scores: dict[str, float]  # factor -> [0,1] or NaN (pre-imputation)
    kill_flags: dict[str, bool]
    provenance: dict[str, Any]
    weights_used: dict[str, float]

    def to_dict(self) -> dict:
        return {
            "site_id": self.site_id,
            "composite": round(self.composite, 4),
            "archetype": self.archetype,
            "sub_scores": {k: round(v, 4) for k, v in self.sub_scores.items()},
            "raw_sub_scores": {
                k: (round(v, 4) if not np.isnan(v) else None)
                for k, v in self.raw_sub_scores.items()
            },
            "kill_flags": self.kill_flags,
            "weights_used": self.weights_used,
            "provenance": self.provenance,
        }


@dataclass
class Site:
    site_id: str
    lat: float
    lon: float
    extras: dict[str, Any] = field(default_factory=dict)


def score_sites(
    sites: Sequence[Site],
    archetype: config.Archetype = config.DEFAULT_ARCHETYPE,
    weight_overrides: Mapping[str, float] | None = None,
) -> list[SiteScore]:
    """Score a cohort of sites against the configured factors."""
    weights = config.load_weights(archetype)
    if weight_overrides:
        weights.update(weight_overrides)
        s = sum(weights.values())
        if s <= 0:
            raise ValueError(
                "weight_overrides leave total weight <= 0; cannot renormalize"
            )
        weights = {k: v / s for k, v in weights.items()}  # renormalize

    # Pass 1: collect per-factor results across the cohort
    per_factor: dict[str, list[FactorResult]] = {f: [] for f in config.FACTOR_NAMES}
    for site in sites:
        for fname in config.FACTOR_NAMES:
            fn = FACTOR_REGISTRY[fname]
            try:
                res = fn(site)
            except Exception as e:  # pragma: no cover — factor failures shouldn't kill scoring
                res = FactorResult(
                    sub_score=float("nan"),
                    kill=False,
                    provenance={"source": fname, "error": repr(e)},
                )
            per_factor[fname].append(res)

    # Pass 2: impute NaN with cohort median per factor
    medians: dict[str, float] = {}
    for fname, results in per_factor.items():
        vals = np.array([r.sub_score for r in results], dtype=float)
        finite = vals[np.isfinite(vals)]
        medians[fname] = float(np.median(finite)) if len(finite) else 0.5

    # Pass 3: assemble per-site composite
    out: list[SiteScore] = []
    for i, site in enumerate(sites):
        raw: dict[str, float] = {}
        imputed: dict[str, float] = {}
        kills: dict[str, bool] = {}
        prov: dict[str, Any] = {}
        weighted = 0.0
        for fname in config.FACTOR_NAMES:
            res = per_factor[fname][i]
            raw[fname] = float(res.sub_score)
            value = res.sub_score if np.isfinite(res.sub_score) else medians[fname]
            imputed[fname] = float(value)
            kills[fname] = bool(res.kill)
            prov[fname] = res.provenance
            weighted += weights[fname] * value
        composite = 10.0 * weighted
        if any(kills.values()):
            composite = 0.0
        out.append(
            SiteScore(
                site_id=site.site_id,
                composite=composite,
                archetype=archetype,
                sub_scores=imputed,
                raw_sub_scores=raw,
                kill_flags=kills,
                provenance=prov,
                weights_used=weights,
            )
        )
    return out
