# Methodology

## Goal

Produce, for every candidate site, a single number `composite ∈ [0, 10]` that
reflects how good that site is for a hyperscale AI data center, where:

- **10** = best in the cohort across every factor that matters
- **0** = disqualified (or worst in cohort across every factor)

The score is intentionally interpretable: every component is a public,
percentile-ranked or anchor-normalized sub-score, every input has a
provenance tag, and the weights are explicit.

## Pipeline

1. **Cohort definition.** A "cohort" is the set of sites being scored together
   (e.g., all H3 r7 hexes inside ERCOT, or a hand-picked CSV of parcels).
   Percentile-style normalizations are computed inside the cohort; anchor
   normalizations are absolute and cohort-independent.
2. **Per-factor sub-score.** Each of the 14 factor modules in
   `src/factors/` returns a `FactorResult(sub_score, kill, provenance)` where
   `sub_score ∈ [0,1]` (higher is better) or `NaN` if the factor's data is
   not yet available for that site.
3. **Imputation.** `NaN` sub-scores are imputed to the cohort median for that
   factor. This is conservative — missing data neither helps nor hurts a
   site relative to its peers.
4. **Composite.** The composite is the weighted sum:
   `composite = 10 · Σ_f w_f · ŝ_f` where `ŝ_f` is the imputed sub-score and
   `w_f` is the weight for factor `f` under the active archetype. Weights
   sum to 1.0 by config validation.
5. **Kill criteria.** If any factor reports `kill=True`, the composite is
   clamped to `0.0` regardless of the weighted sum, and `kill_flags` records
   which criteria fired.

## Sub-score functions

Two normalizer families are used, depending on what the data supports:

- **`percentile_rank`** — for cohort-relative metrics where absolute
  thresholds are meaningless or noisy (e.g., labor density). Produces
  `(rank − 1) / (N − 1)`, optionally inverted.
- **`piecewise(value, anchors)`** — for absolute thresholds where domain
  knowledge gives meaningful anchors (e.g., distance to ≥230 kV
  transmission, retail $/kWh). The anchor list is monotonic in `value`,
  with `sub_score` ∈ [0,1].

Anchors are intentionally documented inside each factor module so they
can be challenged and updated as policy or technology shifts (e.g., if
1.5 GW HVDC interconnects become routine, the transmission distance
anchors should loosen).

## Archetypes

Three weight presets in `config/weights.json`:

- **`training`** — multi-hundred-MW to GW campuses. Weights skew to
  power_transmission, power_cost, gas_pipeline, and tax_incentives.
- **`inference`** — 50–200 MW edge regions where end-user latency
  matters more than raw power cost. Weights skew to fiber, latency,
  permitting.
- **`mixed`** — balanced; the default if archetype is unspecified.

You can also pass `weight_overrides` to `score_sites()` to study
sensitivity (e.g., what if water carried 25% of the score in 2030?).

## Provenance

Every `FactorResult.provenance` carries the source name, retrieved-at
UTC timestamp, and the upstream raw value(s) used to compute the
sub-score. The composite output preserves the per-factor provenance so
any score is fully auditable and reproducible against archived raw data.

## Backtest plan

Once ingest is live, the methodology will be validated by:

1. Building the cohort: every CONUS H3 r7 hex with population density
   below a permissive cap (to exclude downtowns).
2. Scoring the cohort under the `training` archetype with weights frozen
   at a date prior to a public hyperscaler announcement (e.g., 2023-01-01).
3. Marking every hex containing an actually-announced 100+ MW build
   from 2023–2025 (Microsoft, Google, Meta, Amazon, OpenAI/Oracle Stargate,
   xAI Memphis, CoreWeave, Crusoe, etc.).
4. Reporting the share of announced builds that fell in the model's
   top-decile hex.
