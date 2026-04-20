"""EIA — U.S. Energy Information Administration v2 API.

Docs: https://www.eia.gov/opendata/  (free API key, env: EIA_API_KEY)

Datasets we consume:
  - Form 861 / state retail tariffs — average industrial $/kWh by state
  - Form 930 / EBA hourly generation mix per balancing authority

This module caches API responses to data/raw/eia/<dataset>/<YYYY-MM-DD>.json
so repeated scoring runs are free and the data carries an honest
provenance timestamp.
"""
from __future__ import annotations

import json
import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from .. import config

logger = logging.getLogger(__name__)

EIA_API_KEY = os.environ.get("EIA_API_KEY", "")
EIA_BASE = "https://api.eia.gov/v2"
TIMEOUT = 60


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=20), reraise=True)
def _get_json(path: str, params: dict[str, Any]) -> dict:
    if not EIA_API_KEY:
        raise RuntimeError("EIA_API_KEY missing — set it in .env to enable EIA ingest")
    p = {"api_key": EIA_API_KEY, **params}
    r = requests.get(f"{EIA_BASE}/{path}", params=p, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _cache_path(dataset: str) -> Path:
    today = time.strftime("%Y-%m-%d")
    d = config.RAW_DIR / "eia" / dataset / today
    d.mkdir(parents=True, exist_ok=True)
    return d / "data.json"


# ---------------------------------------------------------------------------
# Industrial retail price by state (Form 861, monthly)
# ---------------------------------------------------------------------------

# EIA route for retail sales: /electricity/retail-sales/data/
# Filters: sectorid=IND, frequency=monthly, data=price
# Returns cents/kWh — convert to $/kWh on the way out.

def download_industrial_retail_price() -> Path:
    """Download trailing-12-month industrial retail price by state."""
    cache = _cache_path("retail_industrial")
    if cache.exists():
        return cache
    payload = _get_json(
        "electricity/retail-sales/data/",
        {
            "frequency": "monthly",
            "data[0]": "price",
            "facets[sectorid][]": "IND",
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "offset": 0,
            "length": 5000,
        },
    )
    cache.write_text(json.dumps(payload))
    industrial_retail_price_usd_per_kwh.cache_clear()
    return cache


@lru_cache(maxsize=1)
def _load_retail_index() -> dict[str, list[tuple[str, float]]]:
    """state -> [(period, $/kWh), ...] descending by period."""
    files = sorted((config.RAW_DIR / "eia" / "retail_industrial").glob("*/data.json"), reverse=True)
    if not files:
        return {}
    payload = json.loads(files[0].read_text())
    rows = payload.get("response", {}).get("data") or []
    out: dict[str, list[tuple[str, float]]] = {}
    for row in rows:
        st = row.get("stateid")
        per = row.get("period")
        # EIA returns price in cents/kWh
        try:
            price = float(row["price"]) / 100.0
        except (TypeError, ValueError, KeyError):
            continue
        if not st or not per:
            continue
        out.setdefault(st, []).append((per, price))
    for st in out:
        out[st].sort(key=lambda x: x[0], reverse=True)
    return out


@lru_cache(maxsize=64)
def industrial_retail_price_usd_per_kwh(state: str) -> float | None:
    """Trailing-12-month industrial retail price ($/kWh) for `state`. None if unknown."""
    idx = _load_retail_index()
    rows = idx.get((state or "").upper())
    if not rows:
        return None
    last12 = rows[:12]
    if not last12:
        return None
    return sum(p for _, p in last12) / len(last12)


def cache_status() -> dict[str, dict]:
    """Inventory for the data-status endpoint."""
    out: dict[str, dict] = {}
    for ds in ("retail_industrial",):
        files = sorted((config.RAW_DIR / "eia" / ds).glob("*/data.json"), reverse=True)
        out[ds] = {
            "cached": bool(files),
            "path": str(files[0]) if files else None,
        }
    return out


# Stub kept for the carbon factor — wire when ingest lands
def balancing_authority_carbon_intensity(ba_code: str) -> float | None:
    return None
