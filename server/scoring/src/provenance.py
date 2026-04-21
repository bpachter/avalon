"""Provenance tagging — every factor value carries (source, retrieved_at, raw)."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class Provenance:
    """Where a factor input came from. Attached to every sub-score."""

    source: str  # e.g. "HIFLD Transmission Lines"
    retrieved_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")
    )
    url: str | None = None
    raw: Any = None  # the actual upstream value(s) used

    def to_dict(self) -> dict:
        return asdict(self)
