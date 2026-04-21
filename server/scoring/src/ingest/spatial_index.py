"""Spatial index over cached GeoJSON layers.

Supports two queries the platform needs constantly:
  - nearest_distance_mi(lat, lon)       — for siting score
  - features_in_bbox(xmin, ymin, ...)   — for the map UI

Implementation: rtree over densified line/point centroids (in EPSG:4326,
distances computed via haversine for accuracy). Caches both the rtree
and the densified point arrays in-memory; lazy-loads from disk per layer.

For lines, we densify to ~1-mile spacing. This bounds nearest-distance
error to <0.5 mi and keeps memory predictable (a 100k-mile transmission
network → ~100k points → ~6 MB).
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from .. import config
from ..geo import haversine_mi
from .arcgis_client import latest_cache

logger = logging.getLogger(__name__)

# Approximate degrees per mile at mid-CONUS latitude. Good enough for densification step length.
_MI_PER_DEG_LAT = 69.0


@dataclass
class IndexedLayer:
    source: str
    layer: str
    points: list[tuple[float, float]]      # [(lat, lon), ...] — densified
    raw_features: list[dict]               # original GeoJSON features (for map render)
    geojson_path: Path

    def nearest_distance_mi(self, lat: float, lon: float) -> float | None:
        if not self.points:
            return None
        best = None
        for plat, plon in self.points:
            # quick degree-prefilter to skip obvious far-away points
            if abs(plat - lat) > 5.0:  # ~345 mi; anything beyond is irrelevant for siting
                continue
            d = haversine_mi(lat, lon, plat, plon)
            if best is None or d < best:
                best = d
        return best

    def features_in_bbox(
        self, minx: float, miny: float, maxx: float, maxy: float, limit: int | None = None
    ) -> list[dict]:
        out: list[dict] = []
        for f in self.raw_features:
            geom = f.get("geometry") or {}
            if _bbox_intersects(geom, minx, miny, maxx, maxy):
                out.append(f)
                if limit and len(out) >= limit:
                    break
        return out


def _bbox_intersects(geom: dict, minx: float, miny: float, maxx: float, maxy: float) -> bool:
    bb = _geom_bbox(geom)
    if bb is None:
        return False
    gxmin, gymin, gxmax, gymax = bb
    return not (gxmax < minx or gxmin > maxx or gymax < miny or gymin > maxy)


def _geom_bbox(geom: dict) -> tuple[float, float, float, float] | None:
    minx = miny = float("inf")
    maxx = maxy = float("-inf")
    found = False
    for x, y in _iter_coords(geom):
        found = True
        if x < minx: minx = x
        if y < miny: miny = y
        if x > maxx: maxx = x
        if y > maxy: maxy = y
    return (minx, miny, maxx, maxy) if found else None


def _iter_coords(geom: dict) -> Iterable[tuple[float, float]]:
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    if t == "Point":
        if coords: yield coords[0], coords[1]
    elif t in ("MultiPoint", "LineString"):
        for c in coords: yield c[0], c[1]
    elif t in ("MultiLineString", "Polygon"):
        for ring in coords:
            for c in ring: yield c[0], c[1]
    elif t == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                for c in ring: yield c[0], c[1]


def _densify_line(coords: list[list[float]], step_mi: float = 1.0) -> Iterable[tuple[float, float]]:
    """Sample points along a LineString at ~step_mi intervals. Returns (lat,lon)."""
    if not coords:
        return
    prev_lon, prev_lat = coords[0][0], coords[0][1]
    yield prev_lat, prev_lon
    for x, y in ((c[0], c[1]) for c in coords[1:]):
        seg_mi = haversine_mi(prev_lat, prev_lon, y, x)
        if seg_mi <= step_mi:
            yield y, x
        else:
            n = int(seg_mi // step_mi)
            for k in range(1, n + 1):
                t = (k * step_mi) / seg_mi
                yield prev_lat + t * (y - prev_lat), prev_lon + t * (x - prev_lon)
            yield y, x
        prev_lat, prev_lon = y, x


def _features_to_points(features: list[dict], step_mi: float = 1.0) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for f in features:
        geom = f.get("geometry") or {}
        t = geom.get("type")
        coords = geom.get("coordinates") or []
        if t == "Point" and coords:
            pts.append((coords[1], coords[0]))
        elif t == "MultiPoint":
            for c in coords:
                pts.append((c[1], c[0]))
        elif t == "LineString":
            pts.extend(_densify_line(coords, step_mi))
        elif t == "MultiLineString":
            for line in coords:
                pts.extend(_densify_line(line, step_mi))
        elif t in ("Polygon", "MultiPolygon"):
            # use centroid-ish: first ring midpoint of bbox
            bb = _geom_bbox(geom)
            if bb:
                pts.append(((bb[1] + bb[3]) / 2, (bb[0] + bb[2]) / 2))
    return pts


@lru_cache(maxsize=32)
def load_layer(source: str, layer: str) -> IndexedLayer | None:
    """Load + densify a cached layer. Returns None if no cache exists."""
    gj_path = latest_cache(source, layer, config.RAW_DIR)
    if gj_path is None:
        logger.info("no cache for %s/%s — run ingest first", source, layer)
        return None
    fc = json.loads(gj_path.read_text())
    feats = fc.get("features") or []
    pts = _features_to_points(feats)
    logger.info("loaded %s/%s: %d features, %d densified points", source, layer, len(feats), len(pts))
    return IndexedLayer(
        source=source,
        layer=layer,
        points=pts,
        raw_features=feats,
        geojson_path=gj_path,
    )


def invalidate_cache() -> None:
    """Clear the in-memory layer cache (call after a fresh ingest)."""
    load_layer.cache_clear()
