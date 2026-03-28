"""
pnpm run pr python-test-fixture-local
Load a problem fixture from disk, solve it locally, and assert it matches the expected solution.

Pass --no-mojo to use the pure-Python group generator instead of the Mojo implementation.
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
    use_mojo = "--no-mojo" not in sys.argv
    milp_solver = _parse_solver_arg()

    problem_path = FIXTURES_DIR / "scale-problem.json"
    solution_path = FIXTURES_DIR / "scale-solution.json"

    problem = Problem.model_validate_json(problem_path.read_text())
    expected = Solution.model_validate(json.loads(solution_path.read_text()))
    print(f"Loaded problem ({len(problem.trippers)} trippers) and expected solution")
    print(f"Using {'Mojo' if use_mojo else 'Python'} group generator")
    print(f"Using MILP solver: {milp_solver}")

    solution = solve_problem(problem, use_mojo=use_mojo, milp_solver=milp_solver)
    print(
        f"Got solution: {len(solution.parties)} parties, {solution.total_drive_seconds}s total"
    )

    if solutions_are_equivalent(solution, expected):
        print("Solutions match!")
    else:
        # Parallel group generation may produce different (but equally optimal) assignments
        assert len(solution.parties) == len(expected.parties), (
            f"Party count mismatch: expected {len(expected.parties)}, got {len(solution.parties)}"
        )
        assert (
            abs(solution.total_drive_seconds - expected.total_drive_seconds) < 0.01
        ), (
            f"Drive time mismatch: expected {expected.total_drive_seconds}, got {solution.total_drive_seconds}"
        )
        print("Solutions match (same cost, different optimal assignment)!")


if __name__ == "__main__":
    main()
