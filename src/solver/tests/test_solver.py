from solve import solve_problem
from models import Problem, Solution, Tripper, Party


def solutions_are_equivalent(sol1: Solution, sol2: Solution) -> bool:
    """
    Compare two solutions for equivalence, ignoring party ordering.

    Two solutions are equivalent if they have:
    - The same total drive time (within floating point tolerance)
    - The same set of parties (same driver and passengers, ignoring order)
    """
    if abs(sol1.total_drive_seconds - sol2.total_drive_seconds) > 0.01:
        return False

    if len(sol1.parties) != len(sol2.parties):
        return False

    def normalize_party(party: Party) -> tuple[str | None, tuple[str, ...]]:
        """Return (driver_id, sorted_passenger_ids) tuple."""
        return (party.driver_tripper_id, tuple(sorted(party.passenger_tripper_ids)))

    parties1_normalized = sorted([normalize_party(p) for p in sol1.parties])
    parties2_normalized = sorted([normalize_party(p) for p in sol2.parties])

    return parties1_normalized == parties2_normalized


def test_solve_empty_problem():
    """Test that solve_problem can handle a trivial empty problem."""
    problem = Problem(
        event_id="test-event-1",
        trippers=[],
        tripper_origin_distances_seconds={},
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

    Expected solution: A picks up B (5 minutes total drive time)
    """
    tripper_a = Tripper(
        id="tripper-a",
        user_id="user-a",
        origin_id="origin-a",
        event_id="event-1",
        car_fits=2,
        seconds_before_event_start_can_leave=60,
    )

    tripper_b = Tripper(
        id="tripper-b",
        user_id="user-b",
        origin_id="origin-b",
        event_id="event-1",
        car_fits=0,  # No car
        seconds_before_event_start_can_leave=60,
    )

    problem = Problem(
        event_id="event-1",
        trippers=[tripper_a, tripper_b],
        tripper_origin_distances_seconds={
            ("tripper-a", "tripper-b"): 5.0,
            ("tripper-b", "tripper-a"): 5.0,
        },
    )

    solution = solve_problem(problem)

    # Expected solution: one party with A driving and B as passenger
    expected_solution = Solution(
        id="expected",
        parties=[
            Party(
                id="party-1",
                driver_tripper_id="tripper-a",
                passenger_tripper_ids=["tripper-b"],
            )
        ],
        total_drive_seconds=5.0,
    )

    assert solutions_are_equivalent(solution, expected_solution), (
        f"Expected solution with A driving B (5 min), but got: {solution}"
    )
