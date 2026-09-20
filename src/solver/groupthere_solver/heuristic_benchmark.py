"""Quality benchmark for the Mojo shared-destination heuristic."""

import json
import math
import random
import statistics
from datetime import datetime, timezone
from typing import TypedDict

from groupthere_solver.models import Problem, Tripper, TripperDistance
from groupthere_solver.solve import solve_problem, solve_problem_heuristic


class HeuristicBenchmarkSummary(TypedDict):
    cases: int
    average_ratio: float
    worst_ratio: float
    p90_ratio: float
    exact_mip_gap: float


def make_random_shared_destination_problem(seed: int, n: int) -> Problem:
    rng = random.Random(seed)
    destination = (0.5, 0.5)
    points = [(rng.random(), rng.random()) for _ in range(n)]
    event_time = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)

    trippers: list[Tripper] = []
    for i, (x, y) in enumerate(points):
        direct_seconds = _seconds_between((x, y), destination) + 180
        seats = rng.choice([0, 1, 2, 3])
        must_drive = rng.random() < 0.12
        if must_drive and seats == 0:
            seats = 1

        trippers.append(
            Tripper(
                user_id=f"user-{seed}-{i}",
                origin_id=f"origin-{seed}-{i}",
                event_id=f"event-{seed}",
                required_arrival_time=event_time,
                can_drive=True,
                non_driver_seats=seats,
                must_drive=must_drive,
                seconds_before_event_start_can_leave=3600,
                distance_to_destination_seconds=direct_seconds,
            )
        )

    tripper_distances: list[TripperDistance] = []
    for i, origin in enumerate(points):
        for j, destination_point in enumerate(points):
            if i == j:
                continue
            tripper_distances.append(
                TripperDistance(
                    origin_user_id=trippers[i].user_id,
                    destination_user_id=trippers[j].user_id,
                    distance_seconds=_seconds_between(origin, destination_point) + 30,
                )
            )

    return Problem(
        id=f"random-shared-destination-{seed}",
        event_id=f"event-{seed}",
        trippers=trippers,
        tripper_distances=tripper_distances,
    )


def run_heuristic_quality_benchmark(
    *,
    cases: int = 30,
    min_trippers: int = 8,
    max_trippers: int = 14,
    exact_mip_gap: float = 0.10,
) -> HeuristicBenchmarkSummary:
    ratios: list[float] = []
    rng = random.Random(20260509)

    for seed in range(cases):
        n = rng.randint(min_trippers, max_trippers)
        problem = make_random_shared_destination_problem(seed, n)
        heuristic_solution = solve_problem_heuristic(problem)
        exact_solution = solve_problem(
            problem,
            use_mojo=True,
            milp_solver="cbc",
            mip_gap=exact_mip_gap,
        )

        if not heuristic_solution.feasible or not exact_solution.feasible:
            raise RuntimeError(
                f"Generated problem {problem.id} unexpectedly became infeasible"
            )
        if exact_solution.total_drive_seconds <= 0:
            raise RuntimeError(f"Generated problem {problem.id} has zero exact cost")

        ratios.append(
            heuristic_solution.total_drive_seconds / exact_solution.total_drive_seconds
        )

    return {
        "cases": cases,
        "average_ratio": round(statistics.mean(ratios), 4),
        "worst_ratio": round(max(ratios), 4),
        "p90_ratio": round(statistics.quantiles(ratios, n=10)[8], 4),
        "exact_mip_gap": exact_mip_gap,
    }


def _seconds_between(
    origin: tuple[float, float],
    destination: tuple[float, float],
) -> float:
    return math.dist(origin, destination) * 1800


if __name__ == "__main__":
    print(json.dumps(run_heuristic_quality_benchmark(), indent=2))
