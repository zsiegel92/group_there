"""
Comprehensive benchmark suite for the carpooling solver.

Tests all combinations of:
- Group generation: python vs mojo
- MILP solver: glpk vs cbc (CPU) and cuopt (GPU)
- Problem sizes: 10, 39, 80 trippers
- MIP gap: exact (None), 5%, 1%, 0.5%

All Modal conditions run in parallel via .spawn() + gather for maximum throughput.

Usage:
    # Run full benchmark on Modal (spawns all conditions in parallel)
    uv run --directory src/solver modal run benchmark.py

    # Results are written to benchmark_results.json
"""

import json
import time
from pathlib import Path
from typing import Any

from groupthere_solver.models import Problem
from server import app, cuopt_image

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"

PROBLEM_FILES: dict[str, str] = {
    "10": "scale-problem-10.json",
    "39": "scale-problem.json",
    "80": "scale-problem-150.json",
}

# MIP gap values to test (None = solve to proven optimality)
MIP_GAPS: list[float | None] = [None, 0.05, 0.01, 0.005]


def _format_gap(gap: float | None) -> str:
    if gap is None:
        return "optimal"
    return f"{gap * 100:.1f}%"


def _run_solve(
    problem: Problem,
    *,
    use_mojo: bool,
    milp_solver: str,
    mip_gap: float | None = None,
) -> dict[str, Any]:
    """Run a single solve and return timing results as a dict."""
    import time as _time

    from groupthere_solver.group_generator import generate_feasible_groups
    from groupthere_solver.milp import solve_assignment

    n = len(problem.trippers)

    # Build distance lookup
    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    # Phase 1: Group generation
    t0 = _time.time()
    if use_mojo:
        try:
            from groupthere_solver.mojo_group_generator import (
                generate_feasible_groups_mojo,
            )

            feasible_groups = generate_feasible_groups_mojo(
                problem.trippers, distance_lookup
            )
            group_gen_method = "mojo"
        except Exception as e:
            print(f"Mojo fallback to Python: {e}")
            feasible_groups = generate_feasible_groups(
                problem.trippers, distance_lookup
            )
            group_gen_method = "python (mojo fallback)"
    else:
        feasible_groups = generate_feasible_groups(problem.trippers, distance_lookup)
        group_gen_method = "python"
    t1 = _time.time()
    group_gen_seconds = t1 - t0
    num_groups = len(feasible_groups)

    if not feasible_groups:
        return {
            "num_trippers": n,
            "group_gen_method": group_gen_method,
            "milp_solver": milp_solver,
            "mip_gap": mip_gap,
            "mip_gap_label": _format_gap(mip_gap),
            "num_groups": 0,
            "group_gen_seconds": group_gen_seconds,
            "milp_solve_seconds": 0,
            "total_seconds": group_gen_seconds,
            "feasible": False,
            "optimal": False,
            "total_drive_seconds": 0,
            "num_parties": 0,
        }

    # Phase 2: MILP solve
    t2 = _time.time()
    if milp_solver == "cuopt":
        from groupthere_solver.milp_cuopt import solve_assignment_cuopt

        assignment = solve_assignment_cuopt(n, feasible_groups, mip_gap=mip_gap)
    else:
        assignment = solve_assignment(
            n,
            feasible_groups,
            solver=milp_solver,  # type: ignore[arg-type]
            mip_gap=mip_gap,
        )
    t3 = _time.time()
    milp_solve_seconds = t3 - t2

    return {
        "num_trippers": n,
        "group_gen_method": group_gen_method,
        "milp_solver": milp_solver,
        "mip_gap": mip_gap,
        "mip_gap_label": _format_gap(mip_gap),
        "num_groups": num_groups,
        "group_gen_seconds": round(group_gen_seconds, 4),
        "milp_solve_seconds": round(milp_solve_seconds, 4),
        "total_seconds": round(group_gen_seconds + milp_solve_seconds, 4),
        "feasible": assignment.feasible,
        "optimal": assignment.optimal,
        "total_drive_seconds": round(assignment.total_drive_time, 1),
        "num_parties": len(assignment.selected_groups),
    }


def _run_benchmark_config(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: str,
    mip_gap: float | None,
) -> str:
    """Run a benchmark config and return JSON string result."""
    problem = Problem.model_validate_json(problem_json)
    result = _run_solve(
        problem,
        use_mojo=use_mojo,
        milp_solver=milp_solver,
        mip_gap=mip_gap,
    )
    return json.dumps(result)


# Modal functions for remote execution
@app.function(cpu=4, memory=8_000, timeout=1800)
def benchmark_cpu(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: str,
    mip_gap: float | None,
) -> str:
    return _run_benchmark_config(
        problem_json,
        use_mojo=use_mojo,
        milp_solver=milp_solver,
        mip_gap=mip_gap,
    )


@app.function(image=cuopt_image, gpu="A100", memory=16_000, timeout=1800)
def benchmark_gpu(
    problem_json: str,
    *,
    use_mojo: bool,
    mip_gap: float | None,
) -> str:
    # cuopt doesn't have Mojo installed — always use Python group gen
    return _run_benchmark_config(
        problem_json,
        use_mojo=False,
        milp_solver="cuopt",
        mip_gap=mip_gap,
    )


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

        # CPU conditions: glpk/cbc × python/mojo × mip_gaps
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
                        "env": "modal_cpu",
                    }
                    handle = benchmark_cpu.spawn(
                        problem_json,
                        use_mojo=use_mojo,
                        milp_solver=milp_solver,
                        mip_gap=mip_gap,
                    )
                    handles.append((meta, handle))

        # GPU conditions: cuopt × mip_gaps (always Python group gen — no Mojo on GPU image)
        for mip_gap in MIP_GAPS:
            gap_label = _format_gap(mip_gap)
            meta = {
                "size": size,
                "n": n_trippers,
                "gen": "python",
                "solver": "cuopt",
                "gap": gap_label,
                "env": "modal_gpu_a100",
            }
            handle = benchmark_gpu.spawn(
                problem_json,
                use_mojo=False,
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
