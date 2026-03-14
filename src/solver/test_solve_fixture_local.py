"""
pnpm run python:test-fixture-local
Load a problem fixture from disk, solve it locally, and assert it matches the expected solution.

Pass --solver=glpk or --solver=cbc to choose the MILP solver (default: cbc).
"""

import json
import sys
from pathlib import Path

from groupthere_solver.milp import MilpSolver
from groupthere_solver.mock_problem import solutions_are_equivalent
from groupthere_solver.models import Problem, Solution
from groupthere_solver.solve import solve_problem

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"


def _parse_solver_arg() -> MilpSolver:
    for arg in sys.argv[1:]:
        if arg.startswith("--solver="):
            val = arg.split("=", 1)[1]
            if val in ("glpk", "cbc"):
                return val  # type: ignore[return-value]
            print(f"Unknown solver '{val}', using cbc")
    return "cbc"


def main():
    milp_solver = _parse_solver_arg()

    problem_path = FIXTURES_DIR / "scale-problem.json"
    solution_path = FIXTURES_DIR / "scale-solution.json"

    problem = Problem.model_validate_json(problem_path.read_text())
    expected = Solution.model_validate(json.loads(solution_path.read_text()))
    print(f"Loaded problem ({len(problem.trippers)} trippers) and expected solution")
    print(f"Using MILP solver: {milp_solver}")

    solution = solve_problem(problem, milp_solver=milp_solver)
    print(
        f"Got solution: {len(solution.parties)} parties, {solution.total_drive_seconds}s total"
    )

    assert solutions_are_equivalent(solution, expected), (
        f"Solution mismatch.\n"
        f"Expected {len(expected.parties)} parties, {expected.total_drive_seconds}s total.\n"
        f"Got {len(solution.parties)} parties, {solution.total_drive_seconds}s total."
    )
    print("Solutions match!")


if __name__ == "__main__":
    main()
