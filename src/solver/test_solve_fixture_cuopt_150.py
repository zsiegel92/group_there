"""
Test the cuOpt GPU solver on a large (80 tripper) problem on Modal.

Solves with both CBC (CPU) and cuOpt (GPU) in parallel to compare timing.

Usage:
    uv run --directory src/solver modal run test_solve_fixture_cuopt_150.py
"""

import time
from pathlib import Path

from groupthere_solver.models import Problem
from server import app, solve_problem_cuopt, solve_problem_remote

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"


@app.local_entrypoint()
def main():
    problem_path = FIXTURES_DIR / "scale-problem-150.json"

    problem = Problem.model_validate_json(problem_path.read_text())
    print(f"Loaded problem: {len(problem.trippers)} trippers")

    # Launch both solvers in parallel
    print("Launching CBC (CPU) and cuOpt (GPU) in parallel...")
    start = time.time()
    cbc_handle = solve_problem_remote.spawn(problem)
    cuopt_handle = solve_problem_cuopt.spawn(problem)

    # Wait for cuOpt first (should be faster)
    cuopt_solution = cuopt_handle.get()
    cuopt_elapsed = time.time() - start
    print(
        f"\ncuOpt done in {cuopt_elapsed:.1f}s: "
        f"{len(cuopt_solution.parties)} parties, "
        f"{cuopt_solution.total_drive_seconds:.1f}s drive, "
        f"optimal={cuopt_solution.optimal}"
    )

    # Wait for CBC
    cbc_solution = cbc_handle.get()
    cbc_elapsed = time.time() - start
    print(
        f"CBC done in {cbc_elapsed:.1f}s: "
        f"{len(cbc_solution.parties)} parties, "
        f"{cbc_solution.total_drive_seconds:.1f}s drive, "
        f"optimal={cbc_solution.optimal}"
    )

    # Compare
    assert cuopt_solution.feasible, "cuOpt solution is not feasible!"

    drive_diff = abs(
        cuopt_solution.total_drive_seconds - cbc_solution.total_drive_seconds
    )
    drive_pct = (
        drive_diff / cbc_solution.total_drive_seconds * 100
        if cbc_solution.total_drive_seconds
        else 0
    )

    print("\n--- Comparison ---")
    print(
        f"CBC:   {len(cbc_solution.parties)} parties, {cbc_solution.total_drive_seconds:.1f}s drive, {cbc_elapsed:.1f}s wall"
    )
    print(
        f"cuOpt: {len(cuopt_solution.parties)} parties, {cuopt_solution.total_drive_seconds:.1f}s drive, {cuopt_elapsed:.1f}s wall"
    )
    print(f"Drive time difference: {drive_diff:.1f}s ({drive_pct:.2f}%)")
    print(f"Wall clock speedup: {cbc_elapsed / cuopt_elapsed:.1f}x")
