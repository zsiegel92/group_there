"""Solver for per-tripper commute optimization.

Commute events do not have one shared destination. Each tripper has their own
destination, so a selected carpool route is:

driver origin -> passenger origins in pickup order -> passenger destinations
in the same order -> driver destination.

The selected passenger order is optimized for each candidate group, then the
same assignment MILP used by shared-destination events picks the cheapest set
of groups that covers every tripper exactly once.
"""

from itertools import permutations

from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.milp import solve_assignment
from groupthere_solver.models import Party, Problem, Solution, Tripper
from groupthere_solver.subsets import SubsetEnumerator


def _distance(
    distance_lookup: dict[tuple[str, str], float],
    origin_id: str | None,
    destination_id: str | None,
) -> float | None:
    if not origin_id or not destination_id:
        return None
    if origin_id == destination_id:
        return 0.0
    return distance_lookup.get((origin_id, destination_id))


def _route_drive_time(
    driver: Tripper,
    passengers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
) -> float | None:
    if not driver.destination_id:
        return None

    location_ids = [driver.origin_id]
    location_ids.extend(passenger.origin_id for passenger in passengers)

    for passenger in passengers:
        if not passenger.destination_id:
            return None
        location_ids.append(passenger.destination_id)

    location_ids.append(driver.destination_id)

    total = 0.0
    for origin_id, destination_id in zip(location_ids, location_ids[1:]):
        leg_seconds = _distance(distance_lookup, origin_id, destination_id)
        if leg_seconds is None:
            return None
        total += leg_seconds

    return total


def _calculate_commute_party_drive_time(
    driver: Tripper,
    passengers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
) -> tuple[float | None, list[Tripper]]:
    if not passengers:
        return (
            _distance(
                distance_lookup,
                driver.origin_id,
                driver.destination_id,
            ),
            [],
        )

    min_drive_time: float | None = None
    best_order: list[Tripper] = []

    for passenger_order in permutations(passengers):
        drive_time = _route_drive_time(driver, list(passenger_order), distance_lookup)
        if drive_time is None:
            continue
        if min_drive_time is None or drive_time < min_drive_time:
            min_drive_time = drive_time
            best_order = list(passenger_order)

    return min_drive_time, best_order


def _generate_commute_groups(
    trippers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
) -> list[FeasibleGroup]:
    n = len(trippers)
    enum = SubsetEnumerator()
    feasible_groups: list[FeasibleGroup] = []

    driver_indices = [i for i, tripper in enumerate(trippers) if tripper.car_fits > 0]
    must_drive_indices = [i for i, tripper in enumerate(trippers) if tripper.must_drive]

    if not driver_indices:
        return []

    max_group_size = max(trippers[i].car_fits for i in driver_indices) + 1

    for group_size in range(1, min(n, max_group_size) + 1):
        for group_indices in enum.iter_subsets(n, group_size):
            must_drive_in_group = [i for i in group_indices if i in must_drive_indices]
            if len(must_drive_in_group) > 1:
                continue

            group_drivers = [i for i in group_indices if i in driver_indices]
            if not group_drivers:
                continue

            if must_drive_in_group:
                group_drivers = [must_drive_in_group[0]]

            best_group: FeasibleGroup | None = None
            best_drive_time: float | None = None

            for driver_idx in group_drivers:
                driver = trippers[driver_idx]
                passenger_indices = [i for i in group_indices if i != driver_idx]

                if len(passenger_indices) > driver.car_fits:
                    continue

                if any(trippers[i].must_drive for i in passenger_indices):
                    continue

                passengers = [trippers[i] for i in passenger_indices]
                drive_time, passenger_order = _calculate_commute_party_drive_time(
                    driver,
                    passengers,
                    distance_lookup,
                )

                if drive_time is None:
                    continue

                tripper_to_idx = {
                    tripper.user_id: i for i, tripper in enumerate(trippers)
                }
                ordered_passenger_indices = [
                    tripper_to_idx[tripper.user_id] for tripper in passenger_order
                ]

                if best_drive_time is None or drive_time < best_drive_time:
                    best_drive_time = drive_time
                    best_group = FeasibleGroup(
                        tripper_indices=group_indices,
                        driver_index=driver_idx,
                        passenger_indices=ordered_passenger_indices,
                        drive_time=drive_time,
                    )

            if best_group is not None:
                feasible_groups.append(best_group)

    return feasible_groups


def _build_distance_lookup(problem: Problem) -> dict[tuple[str, str], float]:
    return {
        (distance.origin_location_id, distance.destination_location_id): (
            distance.distance_seconds
        )
        for distance in problem.location_distances
    }


def solve_commute_problem(problem: Problem) -> Solution:
    if not problem.trippers:
        return Solution(
            id=f"solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=True,
            optimal=True,
            parties=[],
            total_drive_seconds=0,
        )

    if any(not tripper.destination_id for tripper in problem.trippers):
        return Solution(
            id=f"solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
            status_message="Every commute participant needs a destination.",
        )

    distance_lookup = _build_distance_lookup(problem)
    feasible_groups = _generate_commute_groups(problem.trippers, distance_lookup)

    if not feasible_groups:
        return Solution(
            id=f"solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    assignment = solve_assignment(len(problem.trippers), feasible_groups, solver="cbc")
    if not assignment.feasible:
        return Solution(
            id=f"solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    parties = []
    for idx, group in enumerate(assignment.selected_groups):
        parties.append(
            Party(
                id=f"party-{idx + 1}",
                vehicle_kind="participant_vehicle",
                driver_tripper_id=problem.trippers[group.driver_index].user_id,
                passenger_tripper_ids=[
                    problem.trippers[i].user_id for i in group.passenger_indices
                ],
            )
        )

    return Solution(
        id=f"solution-{problem.id}",
        kind=problem.kind,
        successfully_completed=True,
        feasible=True,
        optimal=assignment.optimal,
        parties=parties,
        total_drive_seconds=assignment.total_drive_time,
    )
