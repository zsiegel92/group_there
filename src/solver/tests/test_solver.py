import json
from pathlib import Path

from groupthere_solver.solve import solve_problem
from groupthere_solver.models import Problem, Solution
from groupthere_solver.mock_problem import (
    mock_problem,
    mock_problem_expected_solution,
    solutions_are_equivalent,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_solve_empty_problem():
    """Test that solve_problem can handle a trivial empty problem."""
    problem = Problem(
        id="test-problem-1",
        event_id="test-event-1",
        trippers=[],
        tripper_distances=[],
    )

    solution = solve_problem(problem)

    assert isinstance(solution, Solution)
    assert solution.parties == []
    assert solution.total_drive_seconds == 0


def test_solve_simple_driver_and_rider():
    """
    Test a simple scenario with one driver and one rider.

    Setup:
    - Tripper A: has car with 2 seats
    - Tripper B: no car
    - B is 5 minutes from A

    Expected solution: A picks up B (10s total: 5s pickup + 5s to destination)
    """
    solution = solve_problem(mock_problem)
    assert solutions_are_equivalent(solution, mock_problem_expected_solution), (
        f"Expected solution with A driving B (10s total), but got: {solution}"
    )


def test_solve_scale_problem():
    """
    Regression test with a real 39-tripper problem dumped from the database.

    Loads the fixture, solves it, and checks the solution matches the
    previously computed result exactly.
    """
    problem_json = json.loads((FIXTURES_DIR / "scale-problem.json").read_text())
    expected_json = json.loads((FIXTURES_DIR / "scale-solution.json").read_text())

    problem = Problem.model_validate(problem_json)
    expected = Solution.model_validate(expected_json)

    solution = solve_problem(problem)
    assert solutions_are_equivalent(solution, expected), (
        f"Scale problem solution mismatch.\n"
        f"Expected {len(expected.parties)} parties, {expected.total_drive_seconds}s total.\n"
        f"Got {len(solution.parties)} parties, {solution.total_drive_seconds}s total."
    )
