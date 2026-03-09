from server import app, solve_test_problem


@app.local_entrypoint()
def test_server():
    solution = solve_test_problem.remote()
    print(solution)
    assert solution.feasible, "Solution should be feasible"
    assert solution.total_drive_seconds == 10.0, (
        f"Expected 10.0s drive time, got {solution.total_drive_seconds}"
    )
    assert len(solution.parties) == 1, f"Expected 1 party, got {len(solution.parties)}"
    party = solution.parties[0]
    assert party.driver_tripper_id == "user-a"
    assert party.passenger_tripper_ids == ["user-b"]
    print(f"Test passed! Solution: {solution.model_dump_json(indent=2)}")
