"""
Generate and evaluate feasible carpooling groups.

This module pre-computes all feasible groups of trippers, along with their
optimal pickup orders and total drive times. These groups are then used
as inputs to the MILP solver.
"""

from itertools import permutations
from groupthere_solver.models import PartyVehicleKind, Tripper
from groupthere_solver.subsets import SubsetEnumerator


class FeasibleGroup:
    """
    Represents a feasible carpooling group with an optimal pickup order.

    Attributes:
        tripper_indices: Indices of trippers in this group
        driver_index: Index of the driver
        passenger_indices: Indices of passengers in optimal pickup order
        drive_time: Total car travel time for this group's route (in seconds).
            For solo drivers: their direct drive to the destination.
            For carpools: pickup chain + last stop to destination.
    """

    def __init__(
        self,
        tripper_indices: list[int],
        driver_index: int | None,
        passenger_indices: list[int],
        drive_time: float,
        vehicle_kind: PartyVehicleKind = "participant_vehicle",
        assignment_cost_seconds: float | None = None,
        cost_multiplier: float = 1.0,
    ):
        self.tripper_indices = tripper_indices
        self.driver_index = driver_index
        self.passenger_indices = passenger_indices
        self.drive_time = drive_time
        self.vehicle_kind = vehicle_kind
        self.assignment_cost_seconds = (
            drive_time if assignment_cost_seconds is None else assignment_cost_seconds
        )
        self.cost_multiplier = cost_multiplier

    def __repr__(self) -> str:
        return (
            f"FeasibleGroup(kind={self.vehicle_kind}, driver={self.driver_index}, "
            f"passengers={self.passenger_indices}, "
            f"drive_time={self.drive_time:.1f}s, "
            f"assignment_cost={self.assignment_cost_seconds:.1f}s)"
        )


def calculate_party_drive_time(
    driver: Tripper,
    passengers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
) -> tuple[float, list[Tripper]]:
    """
    Calculate the minimum total car travel time for a party and the optimal pickup order.

    This is the full time a car spends on the road: the pickup chain plus the
    drive from the last stop to the event destination. For solo drivers, this
    is simply their direct drive to the destination.

    Args:
        driver: The driver tripper
        passengers: List of passenger trippers
        distance_lookup: Mapping from (origin_id, destination_id) to distance in seconds

    Returns:
        A tuple of (min_drive_time, optimal_passenger_order)
    """
    if not passengers:
        return driver.distance_to_destination_seconds, []

    # Try all permutations of passenger pickup order and find minimum
    min_drive_time = float("inf")
    best_order: list[Tripper] = []

    for perm in permutations(passengers):
        drive_time = 0.0
        current_location = driver.user_id

        # Pick up each passenger
        for passenger in perm:
            drive_time += distance_lookup.get(
                (current_location, passenger.user_id), 0.0
            )
            current_location = passenger.user_id

        # Add the destination leg from the last pickup location
        drive_time += perm[-1].distance_to_destination_seconds

        if drive_time < min_drive_time:
            min_drive_time = drive_time
            best_order = list(perm)

    return min_drive_time, best_order


def generate_feasible_groups(
    trippers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
    external_rideshare_cost_multiplier: float | None = None,
    external_rideshare_seats: int = 3,
    external_rideshare_fixed_cost_seconds: float = 0.0,
) -> list[FeasibleGroup]:
    """
    Generate all feasible carpooling groups.

    A group is feasible if:
    1. It contains at least one tripper who can drive
    2. It respects must_drive constraints (at most one must_drive person,
       and that driver has enough non-driver seats)
    3. It never assigns a must_drive tripper as a passenger

    Args:
        trippers: List of all trippers
        distance_lookup: Distance mapping between tripper locations

    Returns:
        List of all feasible groups with their optimal configurations
    """
    n = len(trippers)
    enum = SubsetEnumerator()
    feasible_groups: list[FeasibleGroup] = []

    driver_indices = [i for i, t in enumerate(trippers) if t.can_drive]
    must_drive_indices = [i for i, t in enumerate(trippers) if t.must_drive]

    rideshare_enabled = external_rideshare_cost_multiplier is not None

    if not driver_indices and not rideshare_enabled:
        # No drivers available - no feasible groups
        return []

    # Total group size is non-driver seat capacity plus the driver.
    max_participant_group_size = (
        max(trippers[i].non_driver_seats for i in driver_indices) + 1
        if driver_indices
        else 0
    )
    max_rideshare_group_size = external_rideshare_seats if rideshare_enabled else 0
    max_group_size = max(max_participant_group_size, max_rideshare_group_size)

    # Generate feasible groups of each size
    for group_size in range(1, min(n, max_group_size) + 1):
        # Iterate over all possible groups of this size
        for group_indices in enum.iter_subsets(n, group_size):
            # Check must_drive constraints
            must_drive_in_group = [i for i in group_indices if i in must_drive_indices]
            if len(must_drive_in_group) > 1:
                # Multiple must_drive people - infeasible
                continue

            # Find potential drivers in this group
            group_drivers = [i for i in group_indices if i in driver_indices]

            if not group_drivers and not rideshare_enabled:
                # No driver in this group - infeasible
                continue

            # If there's a must_drive person, they must be the driver
            if must_drive_in_group:
                must_drive_idx = must_drive_in_group[0]
                if must_drive_idx not in group_drivers:
                    # must_drive person can't drive - infeasible
                    continue
                # Only consider the must_drive person as driver
                group_drivers = [must_drive_idx]

            # For each potential driver, calculate optimal configuration
            best_group: FeasibleGroup | None = None
            best_assignment_cost = float("inf")

            for driver_idx in group_drivers:
                driver = trippers[driver_idx]
                passenger_indices = [i for i in group_indices if i != driver_idx]
                non_driver_seats = driver.non_driver_seats

                if len(passenger_indices) > non_driver_seats:
                    continue

                if any(trippers[pass_idx].must_drive for pass_idx in passenger_indices):
                    continue

                # Calculate optimal drive time and pickup order
                passengers = [trippers[i] for i in passenger_indices]
                drive_time, optimal_order = calculate_party_drive_time(
                    driver, passengers, distance_lookup
                )

                # Convert back to indices
                tripper_to_idx = {t.user_id: i for i, t in enumerate(trippers)}
                optimal_passenger_indices = [
                    tripper_to_idx[t.user_id] for t in optimal_order
                ]

                if drive_time < best_assignment_cost:
                    best_assignment_cost = drive_time
                    best_group = FeasibleGroup(
                        tripper_indices=group_indices,
                        driver_index=driver_idx,
                        passenger_indices=optimal_passenger_indices,
                        drive_time=drive_time,
                    )

            if (
                rideshare_enabled
                and len(must_drive_in_group) == 0
                and len(group_indices) <= external_rideshare_seats
            ):
                best_rideshare_drive_time = float("inf")
                best_rideshare_order: list[int] = []
                for first_stop_idx in group_indices:
                    first_stop = trippers[first_stop_idx]
                    other_indices = [i for i in group_indices if i != first_stop_idx]
                    other_trippers = [trippers[i] for i in other_indices]
                    drive_time, optimal_order = calculate_party_drive_time(
                        first_stop,
                        other_trippers,
                        distance_lookup,
                    )
                    tripper_to_idx = {t.user_id: i for i, t in enumerate(trippers)}
                    rideshare_order = [
                        first_stop_idx,
                        *[tripper_to_idx[t.user_id] for t in optimal_order],
                    ]
                    if drive_time < best_rideshare_drive_time:
                        best_rideshare_drive_time = drive_time
                        best_rideshare_order = rideshare_order

                rideshare_assignment_cost = (
                    best_rideshare_drive_time * external_rideshare_cost_multiplier
                    + external_rideshare_fixed_cost_seconds
                )
                if rideshare_assignment_cost < best_assignment_cost:
                    best_assignment_cost = rideshare_assignment_cost
                    best_group = FeasibleGroup(
                        tripper_indices=group_indices,
                        driver_index=None,
                        passenger_indices=best_rideshare_order,
                        drive_time=best_rideshare_drive_time,
                        vehicle_kind="external_rideshare",
                        assignment_cost_seconds=rideshare_assignment_cost,
                        cost_multiplier=external_rideshare_cost_multiplier,
                    )

            if best_group is not None:
                feasible_groups.append(best_group)

    return feasible_groups
