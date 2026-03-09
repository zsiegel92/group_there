"""
Generate and evaluate feasible carpooling groups.

This module pre-computes all feasible groups of trippers, along with their
optimal pickup orders and total drive times. These groups are then used
as inputs to the MILP solver.
"""

from itertools import permutations
from groupthere_solver.models import Tripper
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
        driver_index: int,
        passenger_indices: list[int],
        drive_time: float,
    ):
        self.tripper_indices = tripper_indices
        self.driver_index = driver_index
        self.passenger_indices = passenger_indices
        self.drive_time = drive_time

    def __repr__(self) -> str:
        return (
            f"FeasibleGroup(driver={self.driver_index}, "
            f"passengers={self.passenger_indices}, "
            f"drive_time={self.drive_time:.1f}s)"
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
) -> list[FeasibleGroup]:
    """
    Generate all feasible carpooling groups.

    A group is feasible if:
    1. It contains at least one driver with sufficient capacity
    2. It respects must_drive constraints (at most one must_drive person,
       and they must have enough capacity)
    3. All non-driver trippers who have cars are willing to ride

    Args:
        trippers: List of all trippers
        distance_lookup: Distance mapping between tripper locations

    Returns:
        List of all feasible groups with their optimal configurations
    """
    n = len(trippers)
    enum = SubsetEnumerator()
    feasible_groups: list[FeasibleGroup] = []

    # Identify potential drivers
    driver_indices = [i for i, t in enumerate(trippers) if t.car_fits > 0]
    must_drive_indices = [i for i, t in enumerate(trippers) if t.must_drive]

    if not driver_indices:
        # No drivers available - no feasible groups
        return []

    # Find max group size (limited by max car capacity)
    max_group_size = (
        max(trippers[i].car_fits for i in driver_indices) + 1
    )  # +1 for driver

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

            if not group_drivers:
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
            best_drive_time = float("inf")

            for driver_idx in group_drivers:
                driver = trippers[driver_idx]
                passenger_indices = [i for i in group_indices if i != driver_idx]

                # Check capacity
                if len(passenger_indices) > driver.car_fits:
                    continue

                # Check if non-driver trippers who have cars are willing to ride
                can_all_ride = True
                for pass_idx in passenger_indices:
                    passenger = trippers[pass_idx]
                    if passenger.car_fits > 0 and passenger.must_drive:
                        can_all_ride = False
                        break

                if not can_all_ride:
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

                if drive_time < best_drive_time:
                    best_drive_time = drive_time
                    best_group = FeasibleGroup(
                        tripper_indices=group_indices,
                        driver_index=driver_idx,
                        passenger_indices=optimal_passenger_indices,
                        drive_time=drive_time,
                    )

            if best_group is not None:
                feasible_groups.append(best_group)

    return feasible_groups
