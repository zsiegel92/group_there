from groupthere_solver.solve import solve_problem
from groupthere_solver.models import Problem, Solution
from groupthere_solver.mock_problem import (
    mock_problem,
    mock_problem_expected_solution,
    solutions_are_equivalent,
)


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
