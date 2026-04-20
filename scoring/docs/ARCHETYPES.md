# Archetypes

Three preset weight profiles ship in `config/weights.json`. They reflect
how hyperscalers actually trade off the 14 factors as of 2025–2026.

## training

> Multi-hundred-MW to GW training cluster. Power-dominant. Latency tolerant.

The dominant constraint is firm interconnection. Latency is essentially
ignored because batch training jobs aren't latency-sensitive. Tax and
permitting matter because the capex is enormous and the schedule
is unforgiving.

## inference

> 50–200 MW latency-sensitive inference / edge region.

Closer to the user is better. The fiber + latency factors carry ~33% of
the weight. Power is still important but raw cost and carbon matter less
than placement quality.

## mixed

> Balanced training + inference campus. Default if archetype is unspecified.

Most real hyperscaler builds end up "mixed" because flagship sites host
both workloads. Use this as the default for greenfield exploration.

## Custom archetypes

Add a new top-level entry under `archetypes` in `config/weights.json`,
ensure the weights cover all 14 factors and sum to 1.0, then call
`score_sites(..., archetype="<your_archetype>")`. You can also pass
`weight_overrides` for ad-hoc sensitivity studies without editing JSON.
