# Carpooling Solver Benchmark Results

> Benchmarked on [Modal](https://modal.com) — all 216 conditions ran in parallel.
> Date: 2026-03-14 | Wall time: ~32 minutes

## Overview

We benchmark every combination of:

| Dimension | Values |
|-----------|--------|
| **Group generation** | Python (itertools) · Mojo (compiled, multi-threaded) |
| **MILP solver** | GLPK · CBC (CPU) · cuOpt (GPU) |
| **Problem size** | 10 trippers · 39 trippers · 80 trippers |
| **MIP gap** | Optimal · 5% · 1% · 0.5% |
| **Hardware** | 2-core/4 GB · 4-core/8 GB · 8-core/16 GB (CPU) · A10G · A100 · A100+8c/64 GB (GPU) |

All solvers converge to the same objective at each problem size, confirming correctness.

---

## Key Findings

1. **Mojo group generation is 18x faster** at 39 trippers (2s vs 36s) — the single biggest optimization.
2. **GLPK is the fastest MILP solver** for small/medium problems; CBC wins at 80 trippers for proven optimality.
3. **cuOpt shines at 80 trippers with relaxed gaps** — at 1% gap, cuOpt solves in 140s vs GLPK's 298s (2x faster). At 5% gap, GLPK's 81s still beats cuOpt's 102s.
4. **Hardware scaling is minimal** — single-threaded CPU solvers don't benefit from more cores; GPU tier (A10G vs A100) doesn't matter for cuOpt.
5. **Best production config:** Mojo + GLPK on 2-core for ≤39 trippers; for 80+ trippers, use cuOpt at 1% gap for speed or CBC for proven optimality.

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

At n=10, Mojo is *slower* than Python (~0.17s init overhead vs 0.002s). The problem is too small for Mojo to help. cuOpt has startup overhead on the first call but subsequent calls on the same worker drop to <0.1s.

</details>

<details>
<summary><strong>n=39 trippers</strong> (medium — where Mojo shines)</summary>

| Group Gen | Solver | Hardware | Total (s) | Group Gen (s) | MILP (s) | Optimal? |
|-----------|--------|----------|-----------|---------------|----------|----------|
| **mojo** | **glpk** | **2cpu/4GB** | **~13s** | 1.8 | 12.0 | Yes |
| mojo | cbc | 4cpu/8GB | 34.4 | 1.6 | 32.8 | Yes |
| python | glpk | 4cpu/8GB | 47.8 | 34.8 | 13.0 | Yes |
| mojo | cuopt | A10G | 79.8 | 1.8 | 78.1 | Yes |

Mojo + GLPK on the **cheapest hardware** (2-core/4 GB) is the fastest at ~13s — no need for expensive GPU instances. cuOpt has a ~78s floor due to Papilo presolve overhead; it finds the optimal solution but takes 6x longer than GLPK.

</details>

<details open>
<summary><strong>n=80 trippers</strong> (large — where solver choice matters most)</summary>

| Group Gen | Solver | Gap | Hardware | Total (s) | MILP (s) | Quality | Optimal? |
|-----------|--------|-----|----------|-----------|----------|---------|----------|
| mojo | glpk | 5% | 8cpu/16GB | **88** | 81 | 0.6% from opt | No |
| mojo | cuopt | 5% | A100 8c/64G | **157** | 148 | 0.1% from opt | No |
| mojo | cuopt | 1% | A10G | **145** | 140 | 0.6% from opt | No |
| mojo | cuopt | 0.5% | A10G | **165** | 158 | <0.01% from opt | No |
| mojo | glpk | 1% | 8cpu/16GB | 304 | 298 | 0.1% from opt | No |
| mojo | glpk | 0.5% | 4cpu/8GB | 471 | 464 | <0.01% from opt | No |
| mojo | cbc | 5% | 4cpu/8GB | 533 | 528 | 3.3% from opt | **Yes** |
| mojo | cbc | optimal | 4cpu/8GB | **575** | 569 | exact | **Yes** |
| mojo | cuopt | optimal | A100 | 610 | 605 | exact* | No |
| mojo | glpk | optimal | 8cpu/16GB | 1165 | 1159 | exact | Yes |

\* cuOpt finds the true optimal (34002.7s drive time) but can't prove it within the 600s time limit.

**Key takeaways for 80 trippers:**
- **Fastest approximate:** GLPK @ 5% gap = **88s** (only 0.6% from optimal, cheapest hardware)
- **Best quality/speed tradeoff:** cuOpt @ 1% gap = **145s** (0.6% from optimal, on cheap A10G GPU)
- **Near-optimal:** cuOpt @ 0.5% gap = **165s** (essentially optimal solution quality)
- **Proven optimal:** CBC = **575s** (~9.6 min, proves optimality)
- cuOpt at tighter gaps (0.5–1%) is **2–3x faster than GLPK** at the same gap levels

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
| 10 | 0.03 | 0.07 | 0.05 | GLPK |
| 39 | 12.0 | 33.3 | 78.1 | GLPK |
| 80 | 1159 | 569 | 605* | CBC |

\* cuOpt finds the correct optimal solution but can't prove it within 600s

### At relaxed gaps (80 trippers, best MILP time per solver)

| Gap | GLPK (s) | CBC (s) | cuOpt (s) | Winner |
|-----|----------|---------|-----------|--------|
| 5% | **81** | 528 | 102 | GLPK |
| 1% | 298 | 560 | **140** | cuOpt |
| 0.5% | 464 | 570 | **158** | cuOpt |
| optimal | 1159 | **569** | 605 | CBC |

GLPK benefits hugely from relaxed gaps — **5% gap cuts solve time from 1159s to 81s** (14x speedup). CBC does not terminate earlier with relaxed gaps. **cuOpt dominates at 0.5–1% gaps**, outperforming both CPU solvers by 2–3x.

---

## Hardware Scaling

### CPU solvers

| Hardware | n=39 GLPK optimal (s) | n=80 CBC optimal (s) |
|----------|----------------------|---------------------|
| 2cpu/4GB | 12.0 | 576 |
| 4cpu/8GB | 13.0 | 575 |
| 8cpu/16GB | 12.3 | 580 |

GLPK and CBC are **single-threaded** — more CPU cores don't help. The cheapest 2-core instance matches 8-core in performance.

### GPU solvers (cuOpt)

| Hardware | n=80 optimal (s) | n=80 @ 1% gap (s) |
|----------|-----------------|-------------------|
| A10G (22 GB VRAM) | 612 | 145 |
| A100 (40 GB VRAM) | 610 | 155 |
| A100 + 8c/64 GB RAM | 611 | 146 |

GPU tier doesn't matter — A10G is as fast as A100 for this problem. The 8-core/64 GB RAM A100 config provides no benefit over the default, confirming the bottleneck is cuOpt's presolve algorithm, not memory or CPU.

---

## cuOpt Analysis

cuOpt's Papilo presolver dominates solve time for smaller problems but becomes a smaller fraction at 80 trippers where B&B search time increases:

| Problem | Presolve (s) | B&B Search (s) | Presolve % of total |
|---------|-------------|----------------|---------------------|
| n=39 | ~60 | ~18 (optimal) | 77% |
| n=80 | ~83 | ~520 (optimal) | 14% |
| n=80 | ~83 | ~57 (1% gap) | 59% |

Key findings:
1. **Presolve overhead:** ~60s for n=39, ~83s for n=80 — all CPU, no GPU benefit
2. **Gap parameter works correctly** with `mip_relative_gap` (not `relative_gap`)
3. **GPU B&B is very fast:** Once past presolve, cuOpt's GPU-accelerated branch & bound is 2–3x faster than CPU solvers at tight gaps
4. **Cold start:** First invocation per container incurs 5–10s GPU initialization

**Verdict:** cuOpt is **the best choice for large problems at tight tolerances** (0.5–1% gap). Its ~83s presolve overhead makes it uncompetitive for small problems or very loose tolerances where GLPK terminates faster. For proven optimality, CBC remains the best option.

---

## Recommendations

| Scenario | Config | Expected Time | Cost |
|----------|--------|---------------|------|
| **≤10 trippers** | Python + GLPK, 2-core | <0.1s | $ |
| **≤39 trippers** | Mojo + GLPK, 2-core | ~13s | $ |
| **≤80 (fast approx)** | Mojo + GLPK @ 5% gap, 2-core | ~90s | $ |
| **≤80 (near-optimal)** | Mojo + cuOpt @ 1% gap, A10G | ~145s | $$ |
| **≤80 (proven optimal)** | Mojo + CBC, 4-core | ~575s | $ |

For production: start with GLPK on cheap hardware for fast approximate solutions. If higher quality is needed and a GPU is available, cuOpt at 0.5–1% gap gives near-optimal results 2–3x faster than GLPK at the same tolerance. Use CBC only when proven optimality is required.
