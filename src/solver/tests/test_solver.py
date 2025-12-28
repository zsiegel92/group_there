from solve import solve_problem
from models import Problem, Solution


def test_solve_empty_problem():
    """Test that solve_problem can handle a trivial empty problem."""
    problem = Problem(
        event_id="test-event-1",
        trippers=[],
        tripper_origin_distances={},
    )

    solution = solve_problem(problem)

    assert isinstance(solution, Solution)
    assert solution.parties == []
    assert solution.total_drive_time_minutes == 0
