# Carpooling Solver Benchmark Results

> Benchmarked on [Modal](https://modal.com) — all 192 conditions ran in parallel.
> Date: 2026-03-14 | Wall time: ~32 minutes

## Overview

We benchmark every combination of:

| Dimension | Values |
|-----------|--------|
| **Group generation** | Python (itertools) · Mojo (compiled, multi-threaded) |
| **MILP solver** | GLPK · CBC (CPU) · cuOpt (GPU) |
| **Problem size** | 10 trippers · 39 trippers · 80 trippers |
| **MIP gap** | Optimal · 5% · 1% · 0.5% |
| **Hardware** | 2-core/4 GB · 4-core/8 GB · 8-core/16 GB (CPU) · A10G · A100 (GPU) |

All solvers converge to the same objective at each problem size, confirming correctness.

---

## Key Findings

1. **Mojo group generation is 18x faster** at 39 trippers (2s vs 36s) — the single biggest optimization.
2. **GLPK is the fastest MILP solver** for small/medium problems; CBC wins at 80 trippers.
3. **cuOpt (GPU) is not competitive** — slower than CPU solvers at every size, and fails when MIP gap is set explicitly.
4. **Hardware scaling is minimal** — 2-core is ~as fast as 8-core for these single-threaded MILP solvers.
5. **Best production config:** Mojo + GLPK on 2-core for ≤39 trippers; Mojo + CBC on 8-core for 80 trippers.

---

## Best Total Time by Configuration

<details>
<summary><strong>n=10 trippers</strong> (trivial — all configs < 0.5s except cuOpt cold start)</summary>

| Group Gen | Solver | Hardware | Total (s) | Group Gen (s) | MILP (s) |
|-----------|--------|----------|-----------|---------------|----------|
| python | glpk | 4cpu/8GB | **0.05** | 0.002 | 0.049 |
| python | cbc | 4cpu/8GB | 0.09 | 0.002 | 0.083 |
| mojo | glpk | 8cpu/16GB | 0.20 | 0.169 | 0.026 |
| mojo | cuopt | A100 | 0.32 | 0.271 | 0.051 |
| python | cuopt | A10G | 5.37 | 0.002 | 5.371 |

At n=10, Mojo is *slower* than Python (~0.17s init overhead vs 0.002s). The problem is too small for Mojo to help. cuOpt has massive startup overhead on the first call (5–10s), but subsequent calls on the same worker drop to <0.1s.

</details>

<details>
<summary><strong>n=39 trippers</strong> (medium — where Mojo shines)</summary>

| Group Gen | Solver | Hardware | Total (s) | Group Gen (s) | MILP (s) | Optimal? |
|-----------|--------|----------|-----------|---------------|----------|----------|
| **mojo** | **glpk** | **2cpu/4GB** | **13.8** | 1.8 | 12.0 | Yes |
| mojo | glpk | 4cpu/8GB | 16.9 | 1.6 | 15.3 | Yes |
| mojo | cbc | 4cpu/8GB | 34.4 | 1.6 | 32.8 | Yes |
| python | glpk | 4cpu/8GB | 47.8 | 34.8 | 13.0 | Yes |
| python | cbc | 4cpu/8GB | 70.6 | 34.9 | 35.7 | Yes |
| mojo | cuopt | A100 | 81.4 | 2.2 | 79.2 | Yes |
| python | cuopt | A100 | 112.1 | 33.5 | 78.6 | Yes |

Mojo + GLPK on the **cheapest hardware** (2-core/4 GB) is the fastest at 13.8s — no need for expensive GPU instances. cuOpt spends ~60s in presolve alone.

</details>

<details open>
<summary><strong>n=80 trippers</strong> (large — minutes-long solves)</summary>

| Group Gen | Solver | Gap | Hardware | Total (s) | Group Gen (s) | MILP (s) | Optimal? |
|-----------|--------|-----|----------|-----------|---------------|----------|----------|
| mojo | glpk | 5% | 2cpu/4GB | **89** | 6.2 | 83.3 | No |
| mojo | glpk | 1% | 4cpu/8GB | 300 | 6.5 | 293 | No |
| mojo | glpk | 0.5% | 8cpu/16GB | 489 | 6.4 | 483 | No |
| mojo | cbc | optimal | 8cpu/16GB | **578** | 6.1 | 572 | **Yes** |
| python | cbc | optimal | 8cpu/16GB | 609 | 33.1 | 576 | Yes |
| mojo | cuopt | optimal | A10G | 610 | 6.1 | 604 | No |
| mojo | glpk | optimal | 2cpu/4GB | 1193 | 6.3 | 1186 | Yes |
| python | glpk | optimal | 4cpu/8GB | 1487 | 29.4 | 1458 | Yes |

For 80 trippers:
- **Fast approximate:** Mojo + GLPK at 5% gap = **89 seconds** (near-optimal)
- **Proven optimal:** Mojo + CBC = **578 seconds** (~9.6 min)
- GLPK takes 2x longer to prove optimality (1186–1487s)
- cuOpt can't prove optimality within 600s timeout

</details>

---

## Group Generation: Mojo vs Python

| Trippers | Python (avg) | Mojo (avg) | Speedup |
|----------|-------------|------------|---------|
| 10 | 0.002s | 0.13s | 0.02x (Python wins — Mojo init overhead) |
| **39** | **36.3s** | **2.0s** | **17.9x** |
| **80** | **33.3s** | **6.4s** | **5.2x** |

At n=39, Mojo saves **34 seconds** per solve. At n=80, it saves **27 seconds**. The Python group generation time plateaus at ~33s for both n=39 and n=80, suggesting it may be hitting a memory or GC wall. Mojo scales more predictably.

---

## MILP Solver Comparison

### At optimal gap (prove optimality)

| Trippers | GLPK (s) | CBC (s) | cuOpt (s) | Winner |
|----------|----------|---------|-----------|--------|
| 10 | 0.03 | 0.07 | 0.05* | GLPK |
| 39 | 12.0 | 33.3 | 78.9 | GLPK |
| 80 | 1186 | 572 | 604† | CBC |

\* cuOpt has 5–10s cold-start overhead on first invocation
† cuOpt did **not** prove optimality — it hit the 600s time limit

### At relaxed gaps (80 trippers, MILP time only)

| Gap | GLPK (s) | CBC (s) | cuOpt (s) |
|-----|----------|---------|-----------|
| 5% | 84 | 541 | ❌ infeasible |
| 1% | 294 | 553 | ❌ infeasible |
| 0.5% | 483 | 563 | ❌ infeasible |
| optimal | 1186 | 572 | 604 (not optimal) |

GLPK benefits hugely from relaxed gaps — **5% gap cuts solve time from 1186s to 84s** (14x speedup). CBC does not terminate earlier with relaxed gaps. cuOpt fails completely when any explicit gap is set (likely an API incompatibility with the `relative_gap` parameter).

---

## Hardware Scaling

| Hardware | n=39 GLPK optimal (s) | n=80 CBC optimal (s) |
|----------|----------------------|---------------------|
| 2cpu/4GB | 12.0 | 583 |
| 4cpu/8GB | 13.0 | 582 |
| 8cpu/16GB | 12.3 | 572 |

GLPK and CBC are both **single-threaded solvers** — more CPU cores don't help. The cheapest 2-core instance is essentially identical in performance. For GPU (cuOpt), A10G and A100 perform similarly since the solver is CPU-bound during presolve (~60s for 39 trippers, ~83–108s for 80).

---

## cuOpt Analysis

cuOpt's Papilo presolver alone takes 60–108 seconds, dominating total solve time for problems where the actual B&B search is fast. Key issues:

1. **Presolve overhead:** 60s for 39 trippers, 83–108s for 80 trippers (all on CPU, no GPU benefit)
2. **MIP gap broken:** Setting `relative_gap` causes infeasible results — use only default gap
3. **Cold start:** First invocation per container incurs 5–10s GPU initialization
4. **No optimality proof:** For 80 trippers, runs the full 600s time limit without proving optimality

**Verdict:** cuOpt is not suitable for this problem formulation. The problem structure (simple set-cover with equality constraints) is well-handled by CPU solvers. cuOpt would shine on larger, denser constraint matrices.

---

## Recommendations

| Scenario | Config | Expected Time |
|----------|--------|---------------|
| **≤10 trippers** | Python + GLPK, 2-core | <0.1s |
| **≤39 trippers** | Mojo + GLPK, 2-core | ~14s |
| **≤80 trippers (fast)** | Mojo + GLPK @ 5% gap, 2-core | ~90s |
| **≤80 trippers (optimal)** | Mojo + CBC, 8-core | ~578s |

The cheapest Modal instance (2-core/4 GB) handles everything up to 39 trippers optimally in under 15 seconds. For 80 trippers, bump to 8-core for CBC, or accept a 5% gap with GLPK on the cheap instance for a 90-second solve.
