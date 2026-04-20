"""Normalizers that turn raw factor inputs into a [0,1] sub-score (1 = best)."""
from __future__ import annotations

from typing import Sequence

import numpy as np


def percentile_rank(values: Sequence[float], higher_is_better: bool = True) -> np.ndarray:
    """Rank values into [0,1] by percentile. NaN preserved as NaN."""
    arr = np.asarray(values, dtype=float)
    out = np.full_like(arr, np.nan, dtype=float)
    mask = ~np.isnan(arr)
    if mask.sum() == 0:
        return out
    ranks = arr[mask].argsort().argsort()
    pct = ranks / max(len(ranks) - 1, 1)
    out[mask] = pct if higher_is_better else 1.0 - pct
    return out


def monotone_clip(
    value: float,
    best: float,
    worst: float,
) -> float:
    """Linearly map `value` into [0,1] given a best and worst anchor.

    If best < worst (lower-is-better), the function is monotonically
    decreasing in `value`. If best > worst (higher-is-better), increasing.
    Values outside [min(best,worst), max(best,worst)] clamp to {0,1}.
    NaN propagates.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return float("nan")
    if best == worst:
        return 1.0
    score = (value - worst) / (best - worst)
    return float(min(1.0, max(0.0, score)))


def piecewise(value: float, anchors: list[tuple[float, float]]) -> float:
    """Piecewise-linear normalizer.

    `anchors` is a list of (input_value, sub_score) ordered by input_value.
    Sub-scores must be in [0,1]. Values outside the anchor range clamp to
    the nearest endpoint.
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return float("nan")
    if value <= anchors[0][0]:
        return float(anchors[0][1])
    if value >= anchors[-1][0]:
        return float(anchors[-1][1])
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= value <= x1:
            t = (value - x0) / (x1 - x0) if x1 != x0 else 0.0
            return float(y0 + t * (y1 - y0))
    return float("nan")
