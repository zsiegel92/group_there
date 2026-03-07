from server import app
from groupthere_solver.models import Solution
from groupthere_solver.solve import solve_problem
from groupthere_solver.mock_problem import mock_problem



@app.function()
def solve_test_problem() -> "Solution":
    return solve_problem(mock_problem)


@app.local_entrypoint()
def test_server():
    solution = solve_test_problem.remote()
    assert solution.feasible, "Solution should be feasible"
    assert (
        solution.total_drive_seconds == 5.0
    ), f"Expected 5.0s drive time, got {solution.total_drive_seconds}"
    assert len(solution.parties) == 1, f"Expected 1 party, got {len(solution.parties)}"
    party = solution.parties[0]
    assert party.driver_tripper_id == "user-a"
    assert party.passenger_tripper_ids == ["user-b"]
    print(f"Test passed! Solution: {solution.model_dump_json(indent=2)}")
