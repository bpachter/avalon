"""Ingest stubs — one module per public source.

Each module exposes lazy, cached fetchers. Real implementations download
shapefiles/CSV/JSON from the source, store under data/raw/ with a
timestamped manifest, and return processed point/polygon datasets.

Until real ingest lands, fetchers return empty containers and the
factor modules emit `stub=True` provenance so the scorer imputes the
cohort median.
"""
