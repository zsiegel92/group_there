"""
pnpm run python:test-fixture-local
Load a problem fixture from disk, solve it on locally, and assert it matches the expected solution.
"""

import json
from pathlib import Path

from groupthere_solver.mock_problem import solutions_are_equivalent
from groupthere_solver.models import Problem, Solution
from groupthere_solver.solve import solve_problem

FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"


def main():
    problem_path = FIXTURES_DIR / "scale-problem.json"
    solution_path = FIXTURES_DIR / "scale-solution.json"

    problem = Problem.model_validate_json(problem_path.read_text())
    expected = Solution.model_validate(json.loads(solution_path.read_text()))
    print(f"Loaded problem ({len(problem.trippers)} trippers) and expected solution")

    solution = solve_problem(problem)
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
