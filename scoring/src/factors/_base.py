"""Shared types for factor modules — kept separate to avoid circular imports."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FactorResult:
    sub_score: float  # [0,1] or NaN
    kill: bool = False
    provenance: dict[str, Any] = field(default_factory=dict)


def stub_result(factor: str, source: str, note: str = "ingest not implemented") -> FactorResult:
    return FactorResult(
        sub_score=float("nan"),
        kill=False,
        provenance={"source": source, "stub": True, "factor": factor, "note": note},
    )
