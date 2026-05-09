import pytest

from groupthere_solver.heuristic_benchmark import run_heuristic_quality_benchmark
from groupthere_solver.mock_problem import (
    mock_problem,
    mock_problem_expected_solution,
    solutions_are_equivalent,
)
from groupthere_solver.models import Problem, Tripper
from groupthere_solver.solve import solve_problem_heuristic


def test_mojo_heuristic_solves_simple_driver_and_rider():
    solution = solve_problem_heuristic(mock_problem)

    assert solutions_are_equivalent(solution, mock_problem_expected_solution)
    assert not solution.optimal


def test_mojo_heuristic_reports_infeasible_without_driver_or_rideshare():
    problem = Problem(
        id="heuristic-infeasible",
        event_id="event-1",
        trippers=[
            Tripper(
                user_id="rider",
                origin_id="origin-rider",
                event_id="event-1",
                can_drive=False,
                non_driver_seats=0,
                must_drive=False,
                seconds_before_event_start_can_leave=600,
                distance_to_destination_seconds=300.0,
            )
        ],
        tripper_distances=[],
    )

    solution = solve_problem_heuristic(problem)

    assert solution.successfully_completed
    assert not solution.feasible


def test_mojo_heuristic_quality_on_generated_problems():
    summary = run_heuristic_quality_benchmark(cases=12)

    assert summary["average_ratio"] <= 1.30
    assert summary["worst_ratio"] <= 1.70


def test_heuristic_entrypoint_is_not_implemented_for_commute_problem():
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
                non_driver_seats=1,
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
    )

    with pytest.raises(NotImplementedError):
        solve_problem_heuristic(problem)
