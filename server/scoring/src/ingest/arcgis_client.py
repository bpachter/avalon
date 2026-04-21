"""Generic ArcGIS REST FeatureServer downloader.

HIFLD layers (and most state/federal GIS portals) expose ArcGIS
FeatureServer endpoints. This module paginates through them, returns
GeoJSON-shaped features, and writes a timestamped cache under
data/raw/<source>/<layer>/.

Why a custom client instead of arcgis2geojson? Two reasons:
  1. Bounded memory: we yield batches instead of materializing whole layers.
  2. Honest provenance: every cache writes a manifest with URL + timestamp
     + record count + bbox so downstream factors can prove freshness.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import urlencode

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

DEFAULT_PAGE_SIZE = 2000  # ArcGIS hard cap is 2000 for most layers
DEFAULT_TIMEOUT = 60      # seconds


@dataclass
class LayerSpec:
    """One ArcGIS FeatureServer layer to fetch."""

    source: str       # e.g. "hifld"
    layer: str        # short slug, e.g. "transmission_230kv_plus"
    url: str          # full FeatureServer/<n> URL
    where: str = "1=1"
    out_fields: str = "*"
    bbox: tuple[float, float, float, float] | None = None  # (xmin, ymin, xmax, ymax) WGS84
    out_sr: int = 4326  # WGS84
    extras: dict[str, str] = field(default_factory=dict)  # extra query params


def _query_url(spec: LayerSpec, *, offset: int, page_size: int) -> str:
    params: dict[str, Any] = {
        "where": spec.where,
        "outFields": spec.out_fields,
        "f": "geojson",
        "outSR": spec.out_sr,
        "resultOffset": offset,
        "resultRecordCount": page_size,
        "returnGeometry": "true",
    }
    if spec.bbox:
        params["geometry"] = ",".join(str(x) for x in spec.bbox)
        params["geometryType"] = "esriGeometryEnvelope"
        params["inSR"] = 4326
        params["spatialRel"] = "esriSpatialRelIntersects"
    params.update(spec.extras)
    return f"{spec.url}/query?{urlencode(params)}"


@retry(stop=stop_after_attempt(4), wait=wait_exponential(multiplier=1, min=2, max=30), reraise=True)
def _http_get_json(url: str) -> dict:
    r = requests.get(url, timeout=DEFAULT_TIMEOUT)
    r.raise_for_status()
    return r.json()


def stream_features(spec: LayerSpec, page_size: int = DEFAULT_PAGE_SIZE) -> Iterator[dict]:
    """Yield GeoJSON Feature dicts from an ArcGIS FeatureServer, paginated."""
    offset = 0
    while True:
        url = _query_url(spec, offset=offset, page_size=page_size)
        logger.debug("ArcGIS GET offset=%d  %s", offset, url)
        payload = _http_get_json(url)
        feats = payload.get("features") or []
        if not feats:
            return
        for f in feats:
            yield f
        if len(feats) < page_size:
            return
        # ArcGIS returns `properties.exceededTransferLimit` at top-level on some endpoints
        if not payload.get("exceededTransferLimit") and len(feats) < page_size:
            return
        offset += page_size


def download_to_cache(
    spec: LayerSpec,
    cache_root: Path,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
    max_features: int | None = None,
) -> Path:
    """Download a layer into cache_root/<source>/<layer>/<YYYY-MM-DD>/.

    Writes:
      - features.geojson  — FeatureCollection (one file, GeoJSON spec)
      - manifest.json     — provenance: url, retrieved_at, count, bbox
    Returns path to features.geojson.
    """
    today = time.strftime("%Y-%m-%d")
    out_dir = cache_root / spec.source / spec.layer / today
    out_dir.mkdir(parents=True, exist_ok=True)
    geojson_path = out_dir / "features.geojson"
    manifest_path = out_dir / "manifest.json"

    if geojson_path.exists() and geojson_path.stat().st_size > 0:
        logger.info("cache hit: %s", geojson_path)
        return geojson_path

    features: list[dict] = []
    minx = miny = float("inf")
    maxx = maxy = float("-inf")

    for i, feat in enumerate(stream_features(spec, page_size=page_size), 1):
        features.append(feat)
        geom = feat.get("geometry") or {}
        for x, y in _iter_coords(geom):
            if x < minx: minx = x
            if y < miny: miny = y
            if x > maxx: maxx = x
            if y > maxy: maxy = y
        if max_features and i >= max_features:
            break
        if i % 10000 == 0:
            logger.info("  ... %d features", i)

    fc = {"type": "FeatureCollection", "features": features}
    geojson_path.write_text(json.dumps(fc))
    manifest = {
        "source": spec.source,
        "layer": spec.layer,
        "url": spec.url,
        "where": spec.where,
        "bbox_query": spec.bbox,
        "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "feature_count": len(features),
        "data_bbox": [minx, miny, maxx, maxy] if features else None,
        "page_size": page_size,
        "max_features": max_features,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info("wrote %d features -> %s", len(features), geojson_path)
    return geojson_path


def _iter_coords(geom: dict) -> Iterable[tuple[float, float]]:
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    if t == "Point":
        yield coords[0], coords[1]
    elif t in ("MultiPoint", "LineString"):
        for c in coords:
            yield c[0], c[1]
    elif t in ("MultiLineString", "Polygon"):
        for ring in coords:
            for c in ring:
                yield c[0], c[1]
    elif t == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                for c in ring:
                    yield c[0], c[1]


def latest_cache(source: str, layer: str, cache_root: Path) -> Path | None:
    """Most recent cache snapshot for (source, layer), or None if never fetched."""
    base = cache_root / source / layer
    if not base.exists():
        return None
    snaps = sorted([p for p in base.iterdir() if p.is_dir()], reverse=True)
    for snap in snaps:
        gj = snap / "features.geojson"
        if gj.exists() and gj.stat().st_size > 0:
            return gj
    return None
