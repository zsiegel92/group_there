"""
Comprehensive benchmark suite for the carpooling solver.

Tests all combinations of:
- MILP solver: glpk vs cbc vs cuopt
- Problem sizes: 10, 39, 80 trippers
- Environments: local vs Modal (CPU and GPU)

After merging the mojo-group-construction branch, add use_mojo parameter
to test mojo vs python group generation as well.

Usage:
    # Run full benchmark on Modal (includes cuOpt GPU)
    uv run --directory src/solver modal run benchmark.py

    # Run local-only benchmark
    uv run --directory src/solver python benchmark.py --local
"""

import json
import sys
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


def _run_solve(
    problem: Problem,
    *,
    milp_solver: str,
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
    feasible_groups = generate_feasible_groups(problem.trippers, distance_lookup)
    t1 = _time.time()
    group_gen_seconds = t1 - t0
    num_groups = len(feasible_groups)

    if not feasible_groups:
        return {
            "num_trippers": n,
            "group_gen_method": "python",
            "milp_solver": milp_solver,
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

        assignment = solve_assignment_cuopt(n, feasible_groups)
    else:
        assignment = solve_assignment(
            n,
            feasible_groups,
            solver=milp_solver,  # type: ignore[arg-type]
        )
    t3 = _time.time()
    milp_solve_seconds = t3 - t2

    return {
        "num_trippers": n,
        "group_gen_method": "python",
        "milp_solver": milp_solver,
        "num_groups": num_groups,
        "group_gen_seconds": round(group_gen_seconds, 3),
        "milp_solve_seconds": round(milp_solve_seconds, 3),
        "total_seconds": round(group_gen_seconds + milp_solve_seconds, 3),
        "feasible": assignment.feasible,
        "optimal": assignment.optimal,
        "total_drive_seconds": round(assignment.total_drive_time, 1),
        "num_parties": len(assignment.selected_groups),
    }


def run_benchmark_config(problem_json: str, milp_solver: str) -> str:
    """Run a benchmark config and return JSON string result."""
    problem = Problem.model_validate_json(problem_json)
    result = _run_solve(problem, milp_solver=milp_solver)
    return json.dumps(result)


# Modal functions for remote execution
@app.function(cpu=4, memory=8_000, timeout=1800)
def benchmark_cpu(problem_json: str, milp_solver: str) -> str:
    return run_benchmark_config(problem_json, milp_solver)


@app.function(image=cuopt_image, gpu="A100", memory=16_000, timeout=1800)
def benchmark_gpu(problem_json: str) -> str:
    return run_benchmark_config(problem_json, "cuopt")


def _load_problem(size: str) -> str:
    filename = PROBLEM_FILES[size]
    return (FIXTURES_DIR / filename).read_text()


@app.local_entrypoint()
def main():
    """Run the full benchmark suite on Modal."""
    results: list[dict[str, Any]] = []
    sizes = ["10", "39", "80"]

    for size in sizes:
        problem_json = _load_problem(size)
        n = json.loads(problem_json)["trippers"]
        print(f"\n{'=' * 60}")
        print(f"Problem size: {len(n)} trippers")
        print(f"{'=' * 60}")

        # CPU solvers (glpk, cbc) on Modal
        for solver in ["glpk", "cbc"]:
            label = f"  Modal CPU | {solver:5s}"
            print(f"{label} ... ", end="", flush=True)
            try:
                result_json = benchmark_cpu.remote(problem_json, solver)
                result = json.loads(result_json)
                result["environment"] = "modal_cpu"
                results.append(result)
                print(
                    f"groups={result['num_groups']}, "
                    f"gen={result['group_gen_seconds']:.1f}s, "
                    f"milp={result['milp_solve_seconds']:.1f}s, "
                    f"total={result['total_seconds']:.1f}s"
                )
            except Exception as e:
                print(f"FAILED: {e}")
                results.append(
                    {
                        "num_trippers": len(n),
                        "environment": "modal_cpu",
                        "milp_solver": solver,
                        "group_gen_method": "python",
                        "error": str(e),
                    }
                )

        # cuOpt on GPU
        label = "  Modal GPU | cuopt"
        print(f"{label} ... ", end="", flush=True)
        try:
            result_json = benchmark_gpu.remote(problem_json)
            result = json.loads(result_json)
            result["environment"] = "modal_gpu_a100"
            results.append(result)
            print(
                f"groups={result['num_groups']}, "
                f"gen={result['group_gen_seconds']:.1f}s, "
                f"milp={result['milp_solve_seconds']:.1f}s, "
                f"total={result['total_seconds']:.1f}s"
            )
        except Exception as e:
            print(f"FAILED: {e}")
            results.append(
                {
                    "num_trippers": len(n),
                    "environment": "modal_gpu_a100",
                    "milp_solver": "cuopt",
                    "group_gen_method": "python",
                    "error": str(e),
                }
            )

    # Save results
    out_path = FIXTURES_DIR.parent.parent / "benchmark_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\n{'=' * 60}")
    print(f"Results saved to {out_path}")
    print(f"{'=' * 60}")


def run_local():
    """Run local-only benchmarks (no cuOpt, no Modal)."""
    results: list[dict[str, Any]] = []
    sizes = ["10", "39"]  # Skip 80 locally — too slow

    for size in sizes:
        problem_json = _load_problem(size)
        problem = Problem.model_validate_json(problem_json)
        n = len(problem.trippers)
        print(f"\n{'=' * 60}")
        print(f"Problem size: {n} trippers")
        print(f"{'=' * 60}")

        for solver in ["glpk", "cbc"]:
            label = f"  Local | {solver:5s}"
            print(f"{label} ... ", end="", flush=True)
            try:
                result = _run_solve(problem, milp_solver=solver)
                result["environment"] = "local"
                results.append(result)
                print(
                    f"groups={result['num_groups']}, "
                    f"gen={result['group_gen_seconds']:.1f}s, "
                    f"milp={result['milp_solve_seconds']:.1f}s, "
                    f"total={result['total_seconds']:.1f}s"
                )
            except Exception as e:
                print(f"FAILED: {e}")
                results.append(
                    {
                        "num_trippers": n,
                        "environment": "local",
                        "milp_solver": solver,
                        "group_gen_method": "python",
                        "error": str(e),
                    }
                )

    out_path = Path(__file__).parent / "benchmark_results_local.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    if "--local" in sys.argv:
        run_local()
    else:
        print(
            "Use 'modal run benchmark.py' for full suite or "
            "'python benchmark.py --local' for local only"
        )
