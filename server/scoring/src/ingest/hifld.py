"""HIFLD Open Data — Homeland Infrastructure Foundation-Level Data.

Portal: https://hifld-geoplatform.opendata.arcgis.com

Real ingest via the ArcGIS REST FeatureServer endpoints HIFLD publishes.
Each layer downloads to data/raw/hifld/<layer>/<YYYY-MM-DD>/features.geojson
with a manifest.json provenance record.

Factor modules call the `*_index()` accessors below, which lazily load
the cached GeoJSON into an in-memory spatial index. If no cache exists
yet, they return None and the factor emits a stub provenance — the
scorer then imputes the cohort median. This keeps the platform operable
on a fresh clone with zero downloaded data.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from .. import config
from .arcgis_client import LayerSpec, download_to_cache, latest_cache
from .spatial_index import IndexedLayer, invalidate_cache, load_layer

logger = logging.getLogger(__name__)

HIFLD_BASE = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services"

LAYERS: dict[str, LayerSpec] = {
    "transmission_230kv_plus": LayerSpec(
        source="hifld",
        layer="transmission_230kv_plus",
        url=f"{HIFLD_BASE}/Electric_Power_Transmission_Lines/FeatureServer/0",
        where="VOLTAGE >= 230",
        out_fields="OBJECTID,VOLTAGE,VOLT_CLASS,OWNER,STATUS,SUB_1,SUB_2,TYPE",
    ),
    "substations": LayerSpec(
        source="hifld",
        layer="substations",
        url=f"{HIFLD_BASE}/Electric_Substations/FeatureServer/0",
        where="STATUS = 'IN SERVICE'",
        out_fields="OBJECTID,NAME,TYPE,STATUS,COUNTY,STATE,MAX_VOLT,MIN_VOLT,LINES",
    ),
    "natgas_pipelines": LayerSpec(
        source="hifld",
        layer="natgas_pipelines",
        url=f"{HIFLD_BASE}/Natural_Gas_Interstate_and_Intrastate_Pipelines/FeatureServer/0",
        where="STATUS = 'In Service'",
        out_fields="OBJECTID,Pipename,Operator,TYPEPIPE,STATUS,Diameter",
    ),
    "longhaul_fiber": LayerSpec(
        source="hifld",
        layer="longhaul_fiber",
        url=f"{HIFLD_BASE}/Long_Haul_Fiber_Optic_Cable/FeatureServer/0",
        where="1=1",
        out_fields="*",
    ),
    "internet_exchanges": LayerSpec(
        source="hifld",
        layer="internet_exchanges",
        url=f"{HIFLD_BASE}/Internet_Exchange_Points/FeatureServer/0",
        where="1=1",
        out_fields="*",
    ),
}


def download(layer_key: str, *, max_features: int | None = None) -> str:
    if layer_key not in LAYERS:
        raise KeyError(f"unknown HIFLD layer: {layer_key} (have: {list(LAYERS)})")
    spec = LAYERS[layer_key]
    path = download_to_cache(spec, config.RAW_DIR, max_features=max_features)
    invalidate_cache()
    _clear_compat_cache()
    return str(path)


def download_all(*, max_features: int | None = None) -> dict[str, str]:
    out: dict[str, str] = {}
    for key in LAYERS:
        try:
            out[key] = download(key, max_features=max_features)
        except Exception as e:
            logger.exception("failed downloading %s: %s", key, e)
            out[key] = f"ERROR: {e}"
    return out


def cache_status() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for key in LAYERS:
        path = latest_cache("hifld", key, config.RAW_DIR)
        out[key] = {"cached": path is not None, "path": str(path) if path else None}
    return out


def transmission_index() -> IndexedLayer | None:
    return load_layer("hifld", "transmission_230kv_plus")


def substations_index() -> IndexedLayer | None:
    return load_layer("hifld", "substations")


def natgas_pipelines_index() -> IndexedLayer | None:
    return load_layer("hifld", "natgas_pipelines")


def longhaul_fiber_index() -> IndexedLayer | None:
    return load_layer("hifld", "longhaul_fiber")


def internet_exchanges_index() -> IndexedLayer | None:
    return load_layer("hifld", "internet_exchanges")


def _clear_compat_cache() -> None:
    transmission_lines_230kv_plus.cache_clear()
    substations.cache_clear()
    natgas_pipelines_major.cache_clear()
    longhaul_fiber.cache_clear()
    internet_exchanges.cache_clear()


@lru_cache(maxsize=1)
def transmission_lines_230kv_plus() -> list[tuple[float, float]]:
    idx = transmission_index()
    return list(idx.points) if idx else []


@lru_cache(maxsize=1)
def substations() -> list[tuple[float, float, dict]]:
    idx = substations_index()
    if not idx:
        return []
    return [(lat, lon, f.get("properties") or {}) for f, (lat, lon) in zip(idx.raw_features, idx.points)]


@lru_cache(maxsize=1)
def natgas_pipelines_major() -> list[tuple[float, float]]:
    idx = natgas_pipelines_index()
    return list(idx.points) if idx else []


@lru_cache(maxsize=1)
def longhaul_fiber() -> list[tuple[float, float]]:
    idx = longhaul_fiber_index()
    return list(idx.points) if idx else []


@lru_cache(maxsize=1)
def internet_exchanges() -> list[tuple[float, float, dict]]:
    idx = internet_exchanges_index()
    if not idx:
        return []
    return [(lat, lon, f.get("properties") or {}) for f, (lat, lon) in zip(idx.raw_features, idx.points)]
