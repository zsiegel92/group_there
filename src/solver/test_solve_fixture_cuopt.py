"""
Test the cuOpt GPU solver on Modal.

Usage:
    pnpm run pr python-test-fixture-cuopt
"""

import json
from pathlib import Path

from groupthere_solver.mock_problem import solutions_are_equivalent
from groupthere_solver.models import Problem, Solution
from server import app, solve_problem_gpu

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"


@app.local_entrypoint()
def main():
    problem_path = FIXTURES_DIR / "scale-problem.json"
    solution_path = FIXTURES_DIR / "scale-solution.json"

    problem = Problem.model_validate_json(problem_path.read_text())
    expected = Solution.model_validate(json.loads(solution_path.read_text()))
    print(f"Loaded problem ({len(problem.trippers)} trippers) and expected solution")
    print("Solving with cuOpt on GPU...")

    solution = solve_problem_gpu.remote(problem)
    print(
        f"Got solution: {len(solution.parties)} parties, {solution.total_drive_seconds}s total"
    )

    if solutions_are_equivalent(solution, expected):
        print("Solutions match!")
    else:
        assert len(solution.parties) == len(expected.parties), (
            f"Party count mismatch: expected {len(expected.parties)}, got {len(solution.parties)}"
        )
        assert (
            abs(solution.total_drive_seconds - expected.total_drive_seconds) < 0.01
        ), (
            f"Drive time mismatch: expected {expected.total_drive_seconds}, got {solution.total_drive_seconds}"
        )
        print("Solutions match (same cost, different optimal assignment)!")
