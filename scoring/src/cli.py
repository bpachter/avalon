"""Command-line interface for Phase 7.

Usage:
    python -m src.cli score   --input config/sample_sites.csv
    python -m src.cli ingest  --all
    python -m src.cli ingest  --factor power_transmission
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

try:
    import typer
except ImportError:  # graceful — let the user run --help even without typer
    typer = None  # type: ignore

from . import config
from .score import Site, score_sites


def _load_sites_csv(path: Path) -> list[Site]:
    out: list[Site] = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out.append(
                Site(
                    site_id=row["site_id"],
                    lat=float(row["lat"]),
                    lon=float(row["lon"]),
                    extras={k: v for k, v in row.items() if k not in {"site_id", "lat", "lon"}},
                )
            )
    return out


def cmd_score(input_path: str, archetype: str = "training", out_dir: str | None = None) -> int:
    sites = _load_sites_csv(Path(input_path))
    results = score_sites(sites, archetype=archetype)  # type: ignore[arg-type]

    out = Path(out_dir) if out_dir else config.PROCESSED_DIR
    out.mkdir(parents=True, exist_ok=True)

    json_path = out / "sites_scored.json"
    csv_path = out / "sites_scored.csv"

    json_path.write_text(json.dumps([r.to_dict() for r in results], indent=2))

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["site_id", "composite", "archetype", *config.FACTOR_NAMES, "kill_any"])
        for r in results:
            w.writerow(
                [
                    r.site_id,
                    round(r.composite, 4),
                    r.archetype,
                    *[round(r.sub_scores[f], 4) for f in config.FACTOR_NAMES],
                    any(r.kill_flags.values()),
                ]
            )

    ranked = sorted(results, key=lambda r: r.composite, reverse=True)
    print(f"\nScored {len(results)} sites under archetype={archetype!r}")
    print(f"  -> {json_path}")
    print(f"  -> {csv_path}\n")
    print(f"{'rank':>4}  {'site_id':<14}  {'score':>6}  {'kill?':<6}")
    print("-" * 40)
    for i, r in enumerate(ranked, 1):
        kill = "KILL" if any(r.kill_flags.values()) else ""
        print(f"{i:>4}  {r.site_id:<14}  {r.composite:>6.2f}  {kill:<6}")
    return 0


def cmd_ingest(factor: str | None = None, all_: bool = False, max_features: int | None = None) -> int:
    if not (factor or all_):
        print("specify --factor <name> or --all", file=sys.stderr)
        return 2

    from .ingest import hifld, eia

    if all_:
        print("== HIFLD ==")
        for k, v in hifld.download_all(max_features=max_features).items():
            print(f"  {k:32}  {v}")
        print("== EIA ==")
        try:
            print(f"  retail_industrial             {eia.download_industrial_retail_price()}")
        except Exception as e:
            print(f"  retail_industrial             ERROR: {e}")
        return 0

    # Single-factor / single-source ingest dispatch
    if factor in hifld.LAYERS:
        path = hifld.download(factor, max_features=max_features)
        print(f"{factor}: {path}")
        return 0
    if factor == "eia_retail":
        print(f"eia_retail: {eia.download_industrial_retail_price()}")
        return 0
    print(
        f"unknown ingest target: {factor!r}\n"
        f"valid HIFLD layers: {list(hifld.LAYERS)}\n"
        f"valid EIA datasets: ['eia_retail']",
        file=sys.stderr,
    )
    return 2


def cmd_status() -> int:
    from .ingest import hifld, eia
    print("HIFLD layers:")
    for k, v in hifld.cache_status().items():
        flag = "OK " if v["cached"] else "-- "
        print(f"  {flag} {k:32}  {v['path'] or '(no cache)'}")
    print("EIA datasets:")
    for k, v in eia.cache_status().items():
        flag = "OK " if v["cached"] else "-- "
        print(f"  {flag} {k:32}  {v['path'] or '(no cache)'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv or argv[0] in {"-h", "--help"}:
        print(__doc__)
        return 0

    cmd, *rest = argv
    if cmd == "score":
        # tiny argparser to avoid the typer dep at runtime for the smoke path
        kwargs: dict[str, str] = {}
        i = 0
        while i < len(rest):
            if rest[i] == "--input":
                kwargs["input_path"] = rest[i + 1]; i += 2
            elif rest[i] == "--archetype":
                kwargs["archetype"] = rest[i + 1]; i += 2
            elif rest[i] in {"--out", "--out-dir"}:
                kwargs["out_dir"] = rest[i + 1]; i += 2
            else:
                print(f"unknown arg: {rest[i]}", file=sys.stderr); return 2
        if "input_path" not in kwargs:
            print("--input <csv> is required", file=sys.stderr); return 2
        return cmd_score(**kwargs)
    if cmd == "ingest":
        factor = None
        all_ = False
        max_features: int | None = None
        i = 0
        while i < len(rest):
            if rest[i] == "--factor":
                factor = rest[i + 1]; i += 2
            elif rest[i] == "--all":
                all_ = True; i += 1
            elif rest[i] == "--max":
                max_features = int(rest[i + 1]); i += 2
            else:
                print(f"unknown arg: {rest[i]}", file=sys.stderr); return 2
        return cmd_ingest(factor=factor, all_=all_, max_features=max_features)
    if cmd == "status":
        return cmd_status()
    print(f"unknown command: {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
