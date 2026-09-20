# Mojo Heuristic Benchmark

Command:

```sh
pnpm run pr python-heuristic-benchmark
```

Local run on 2026-05-09:

```json
{
  "cases": 30,
  "average_ratio": 1.214,
  "worst_ratio": 1.4307,
  "p90_ratio": 1.3907,
  "exact_mip_gap": 0.1
}
```

Ratios are heuristic total drive seconds divided by the CBC solution total drive
seconds, with CBC allowed a 10% MIP gap for faster iteration. Generated cases
use 8-14 shared-destination trippers with random planar travel times, random
seat counts, and occasional must-drive constraints.
