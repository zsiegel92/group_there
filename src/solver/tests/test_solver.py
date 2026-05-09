import json
from pathlib import Path

from groupthere_solver.solve import solve_problem
from groupthere_solver.models import (
    LocationDistance,
    Problem,
    Solution,
    Tripper,
    TripperDistance,
)
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


def test_solve_zero_non_driver_seat_driver_can_drive_solo():
    problem = Problem(
        id="zero-passenger-seat-problem",
        event_id="event-1",
        trippers=[
            Tripper(
                user_id="driver",
                origin_id="origin-driver",
                event_id="event-1",
                can_drive=True,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=600,
                distance_to_destination_seconds=300.0,
            )
        ],
        tripper_distances=[],
    )

    solution = solve_problem(problem, use_mojo=False)

    assert solution.feasible
    assert solution.total_drive_seconds == 300.0
    assert len(solution.parties) == 1
    assert solution.parties[0].driver_tripper_id == "driver"
    assert solution.parties[0].passenger_tripper_ids == []


def test_solve_shared_destination_uses_rideshare_when_no_driver():
    problem = Problem(
        id="rideshare-problem",
        event_id="event-1",
        external_rideshare_mode="always_available",
        external_rideshare_cost_multiplier=1.5,
        trippers=[
            Tripper(
                user_id="rider-1",
                origin_id="origin-1",
                event_id="event-1",
                can_drive=False,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=600,
                distance_to_destination_seconds=300.0,
            ),
            Tripper(
                user_id="rider-2",
                origin_id="origin-2",
                event_id="event-1",
                can_drive=False,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=600,
                distance_to_destination_seconds=240.0,
            ),
        ],
        tripper_distances=[
            TripperDistance(
                origin_user_id="rider-1",
                destination_user_id="rider-2",
                distance_seconds=60,
            ),
            TripperDistance(
                origin_user_id="rider-2",
                destination_user_id="rider-1",
                distance_seconds=80,
            ),
        ],
    )

    solution = solve_problem(problem, use_mojo=False)

    assert solution.feasible
    assert solution.total_drive_seconds == 300.0
    assert solution.external_rideshare_vehicle_count == 1
    assert solution.total_external_rideshare_seconds == 300.0
    assert solution.total_external_rideshare_cost_seconds == 450.0
    assert len(solution.parties) == 1
    assert solution.parties[0].vehicle_kind == "external_rideshare"
    assert solution.parties[0].driver_tripper_id is None
    assert solution.parties[0].passenger_tripper_ids == ["rider-1", "rider-2"]


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


def test_solve_commute_driver_and_rider():
    problem = Problem(
        id="commute-problem-1",
        event_id="event-1",
        kind="commute",
        trippers=[
            Tripper(
                user_id="driver",
                origin_id="driver-home",
                event_id="event-1",
                destination_id="driver-office",
                can_drive=True,
                non_driver_seats=2,
                must_drive=True,
                seconds_before_event_start_can_leave=1800,
                seconds_before_required_arrival_can_leave=1800,
                distance_to_destination_seconds=600,
            ),
            Tripper(
                user_id="rider",
                origin_id="rider-home",
                event_id="event-1",
                destination_id="rider-office",
                can_drive=False,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=1800,
                seconds_before_required_arrival_can_leave=1800,
                distance_to_destination_seconds=900,
            ),
        ],
        location_distances=[
            LocationDistance(
                origin_location_id="driver-home",
                destination_location_id="driver-office",
                distance_seconds=600,
            ),
            LocationDistance(
                origin_location_id="driver-home",
                destination_location_id="rider-home",
                distance_seconds=120,
            ),
            LocationDistance(
                origin_location_id="rider-home",
                destination_location_id="rider-office",
                distance_seconds=480,
            ),
            LocationDistance(
                origin_location_id="rider-office",
                destination_location_id="driver-office",
                distance_seconds=180,
            ),
        ],
    )

    solution = solve_problem(problem)

    assert solution.kind == "commute"
    assert solution.feasible
    assert solution.successfully_completed
    assert solution.total_drive_seconds == 780
    assert len(solution.parties) == 1
    assert solution.parties[0].driver_tripper_id == "driver"
    assert solution.parties[0].passenger_tripper_ids == ["rider"]


def test_solve_commute_zero_non_driver_seat_driver_can_drive_solo():
    problem = Problem(
        id="commute-zero-passenger-seat-problem",
        event_id="event-1",
        kind="commute",
        trippers=[
            Tripper(
                user_id="driver",
                origin_id="driver-home",
                event_id="event-1",
                destination_id="driver-office",
                can_drive=True,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=1800,
                seconds_before_required_arrival_can_leave=1800,
                distance_to_destination_seconds=600,
            )
        ],
        location_distances=[
            LocationDistance(
                origin_location_id="driver-home",
                destination_location_id="driver-office",
                distance_seconds=600,
            )
        ],
    )

    solution = solve_problem(problem)

    assert solution.kind == "commute"
    assert solution.feasible
    assert solution.total_drive_seconds == 600.0
    assert len(solution.parties) == 1
    assert solution.parties[0].driver_tripper_id == "driver"
    assert solution.parties[0].passenger_tripper_ids == []


def test_solve_commute_uses_only_location_distances():
    problem = Problem(
        id="commute-problem-2",
        event_id="event-1",
        kind="commute",
        trippers=[
            Tripper(
                user_id="driver",
                origin_id="driver-home",
                event_id="event-1",
                destination_id="driver-office",
                can_drive=True,
                non_driver_seats=2,
                must_drive=True,
                seconds_before_event_start_can_leave=1800,
                seconds_before_required_arrival_can_leave=1800,
                distance_to_destination_seconds=600,
            ),
            Tripper(
                user_id="rider",
                origin_id="rider-home",
                event_id="event-1",
                destination_id="rider-office",
                can_drive=False,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=1800,
                seconds_before_required_arrival_can_leave=1800,
                distance_to_destination_seconds=900,
            ),
        ],
        tripper_distances=[
            TripperDistance(
                origin_user_id="driver",
                destination_user_id="rider",
                distance_seconds=120,
            ),
            TripperDistance(
                origin_user_id="rider",
                destination_user_id="driver",
                distance_seconds=120,
            ),
        ],
        location_distances=[
            LocationDistance(
                origin_location_id="driver-home",
                destination_location_id="driver-office",
                distance_seconds=600,
            ),
            LocationDistance(
                origin_location_id="rider-home",
                destination_location_id="rider-office",
                distance_seconds=480,
            ),
            LocationDistance(
                origin_location_id="rider-office",
                destination_location_id="driver-office",
                distance_seconds=180,
            ),
        ],
    )

    solution = solve_problem(problem)

    assert solution.kind == "commute"
    assert not solution.feasible
