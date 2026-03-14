"""
Comprehensive benchmark suite for the carpooling solver.

Tests all combinations of:
- Group generation: python vs mojo
- MILP solver: glpk vs cbc (CPU) and cuopt (GPU)
- Problem sizes: 10, 39, 80 trippers
- MIP gap: exact (None), 5%, 1%, 0.5%
- Hardware: CPU (2-core/4GB, 4-core/8GB, 8-core/16GB), GPU (A10G, A100)

All Modal conditions run in parallel via .spawn() for maximum throughput.

Usage:
    pnpm run python:benchmark
"""

import json
import time
from pathlib import Path
from typing import Any

from server import (
    app,
    benchmark_cpu_2c4g,
    benchmark_cpu_4c8g,
    benchmark_cpu_8c16g,
    benchmark_gpu_a10g,
    benchmark_gpu_a100,
)

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"

PROBLEM_FILES: dict[str, str] = {
    "10": "scale-problem-10.json",
    "39": "scale-problem.json",
    "80": "scale-problem-150.json",
}

# MIP gap values to test (None = solve to proven optimality)
MIP_GAPS: list[float | None] = [None, 0.05, 0.01, 0.005]

# Hardware configurations to benchmark
CPU_CONFIGS: list[dict[str, Any]] = [
    {"label": "2cpu_4gb", "fn": benchmark_cpu_2c4g},
    {"label": "4cpu_8gb", "fn": benchmark_cpu_4c8g},
    {"label": "8cpu_16gb", "fn": benchmark_cpu_8c16g},
]

GPU_CONFIGS: list[dict[str, Any]] = [
    {"label": "a10g", "fn": benchmark_gpu_a10g},
    {"label": "a100", "fn": benchmark_gpu_a100},
]


def _format_gap(gap: float | None) -> str:
    if gap is None:
        return "optimal"
    return f"{gap * 100:.1f}%"


def _load_problem(size: str) -> str:
    filename = PROBLEM_FILES[size]
    return (FIXTURES_DIR / filename).read_text()


@app.local_entrypoint()
def main():
    """Run the full benchmark suite on Modal — all conditions in parallel."""
    sizes = ["10", "39", "80"]
    cpu_solvers = ["glpk", "cbc"]
    group_gen_methods = [False, True]  # Python, Mojo

    # Build all conditions and spawn them in parallel
    print("Spawning all benchmark conditions in parallel...")
    wall_start = time.time()

    handles: list[tuple[dict[str, Any], Any]] = []  # (metadata, handle)

    for size in sizes:
        problem_json = _load_problem(size)
        n_trippers = len(json.loads(problem_json)["trippers"])

        # CPU conditions: hardware × solver × group_gen × mip_gap
        for hw in CPU_CONFIGS:
            fn = hw["fn"]
            for milp_solver in cpu_solvers:
                for use_mojo in group_gen_methods:
                    for mip_gap in MIP_GAPS:
                        gen_label = "mojo" if use_mojo else "python"
                        gap_label = _format_gap(mip_gap)
                        meta = {
                            "size": size,
                            "n": n_trippers,
                            "gen": gen_label,
                            "solver": milp_solver,
                            "gap": gap_label,
                            "hw": hw["label"],
                            "env": f"modal_cpu_{hw['label']}",
                        }
                        handle = fn.spawn(
                            problem_json,
                            use_mojo=use_mojo,
                            milp_solver=milp_solver,
                            mip_gap=mip_gap,
                        )
                        handles.append((meta, handle))

        # GPU conditions: gpu_type × group_gen × mip_gap (cuopt only)
        for hw in GPU_CONFIGS:
            fn = hw["fn"]
            for use_mojo in group_gen_methods:
                for mip_gap in MIP_GAPS:
                    gen_label = "mojo" if use_mojo else "python"
                    gap_label = _format_gap(mip_gap)
                    meta = {
                        "size": size,
                        "n": n_trippers,
                        "gen": gen_label,
                        "solver": "cuopt",
                        "gap": gap_label,
                        "hw": hw["label"],
                        "env": f"modal_gpu_{hw['label']}",
                    }
                    handle = fn.spawn(
                        problem_json,
                        use_mojo=use_mojo,
                        milp_solver="cuopt",
                        mip_gap=mip_gap,
                    )
                    handles.append((meta, handle))

    total_conditions = len(handles)
    print(f"Spawned {total_conditions} conditions. Collecting results...\n")

    results: list[dict[str, Any]] = []
    for i, (meta, handle) in enumerate(handles):
        label = (
            f"[{i + 1}/{total_conditions}] "
            f"n={meta['n']:>3} | {meta['gen']:>6} | {meta['solver']:>5} | "
            f"gap={meta['gap']:>7} | {meta['env']}"
        )
        try:
            result_json = handle.get()
            result = json.loads(result_json)
            result["environment"] = meta["env"]
            result["hardware"] = meta["hw"]
            results.append(result)
            print(
                f"{label} -> "
                f"gen={result['group_gen_seconds']:.3f}s, "
                f"milp={result['milp_solve_seconds']:.3f}s, "
                f"total={result['total_seconds']:.3f}s"
            )
        except Exception as e:
            print(f"{label} -> FAILED: {e}")
            results.append(
                {
                    "num_trippers": meta["n"],
                    "environment": meta["env"],
                    "hardware": meta["hw"],
                    "milp_solver": meta["solver"],
                    "group_gen_method": meta["gen"],
                    "mip_gap_label": meta["gap"],
                    "error": str(e),
                }
            )

    wall_elapsed = time.time() - wall_start

    # Save results
    out_path = Path(__file__).parent / "benchmark_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\n{'=' * 60}")
    print(f"Completed {total_conditions} conditions in {wall_elapsed:.1f}s wall time")
    print(f"Results saved to {out_path}")
    print(f"{'=' * 60}")
