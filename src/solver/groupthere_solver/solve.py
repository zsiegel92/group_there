from itertools import permutations
from groupthere_solver.models import Problem, Solution, Party, Tripper


def calculate_party_drive_time(
    driver: Tripper,
    passengers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
) -> float:
    """
    Calculate total drive time for a party.

    This represents the pickup distances only (detours from the baseline).
    Everyone needs to get to the destination, so we only count the extra
    driving needed for carpooling.
    """
    if not passengers:
        # Driver drives alone - no extra pickups needed
        return 0.0

    # Try all permutations of passenger pickup order and find minimum
    min_drive_time = float("inf")

    for perm in permutations(passengers):
        drive_time = 0.0
        current_location = driver.user_id

        # Pick up each passenger
        for passenger in perm:
            drive_time += distance_lookup.get(
                (current_location, passenger.user_id), 0.0
            )
            current_location = passenger.user_id

        # Note: We don't add the final drive to destination because
        # that's baseline - everyone needs to get there somehow

        min_drive_time = min(min_drive_time, drive_time)

    return min_drive_time


def generate_partitions(items: list, max_partition_size: int | None = None):
    """Generate all partitions of items into non-empty subsets."""
    if not items:
        yield []
        return

    if len(items) == 1:
        yield [[items[0]]]
        return

    first = items[0]
    rest = items[1:]

    # Generate partitions of rest
    for partition in generate_partitions(rest, max_partition_size):
        # Add first to each existing subset
        for i, subset in enumerate(partition):
            if max_partition_size is None or len(subset) < max_partition_size:
                new_partition = [
                    subset + [first] if j == i else list(s)
                    for j, s in enumerate(partition)
                ]
                yield new_partition

        # Add first as a new subset
        yield partition + [[first]]


def solve_problem(problem: Problem) -> Solution:
    """
    Naive exhaustive search solver.

    Tries all possible ways to partition trippers into parties,
    assign drivers, and order pickups.
    """
    # Handle empty problem
    if not problem.trippers:
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=True,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    # Build distance lookup for O(1) access
    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    # Identify potential drivers (those with cars)
    potential_drivers = [t for t in problem.trippers if t.car_fits > 0]

    # If no drivers, problem is infeasible
    if not potential_drivers:
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    best_solution = None
    best_total_drive_time = float("inf")

    # Try all partitions of trippers
    for partition in generate_partitions(problem.trippers):
        # For each subset in the partition, try assigning a driver
        valid = True
        total_drive_time = 0.0
        parties = []

        for party_idx, party_trippers in enumerate(partition):
            # Find drivers in this party
            party_drivers = [t for t in party_trippers if t.car_fits > 0]

            # If no driver in this party, try each potential driver
            if not party_drivers:
                # No one in this party can drive - invalid partition
                valid = False
                break

            # Try each driver in this party
            best_party_driver = None
            best_party_drive_time = float("inf")
            best_party_passengers = None

            for driver in party_drivers:
                passengers = [t for t in party_trippers if t.user_id != driver.user_id]

                # Check capacity constraint
                if len(passengers) > driver.car_fits:
                    continue

                # Check if non-driver trippers who have cars are willing to ride
                can_ride = True
                for passenger in passengers:
                    if passenger.car_fits > 0 and passenger.must_drive:
                        can_ride = False
                        break

                if not can_ride:
                    continue

                # Calculate drive time for this driver/passenger combo
                drive_time = calculate_party_drive_time(
                    driver, passengers, distance_lookup
                )

                if drive_time < best_party_drive_time:
                    best_party_drive_time = drive_time
                    best_party_driver = driver
                    best_party_passengers = passengers

            if best_party_driver is None:
                # No valid driver for this party
                valid = False
                break

            # Type checker: best_party_passengers is guaranteed to be set
            # when best_party_driver is not None
            assert best_party_passengers is not None

            total_drive_time += best_party_drive_time
            parties.append(
                Party(
                    id=f"party-{party_idx + 1}",
                    driver_tripper_id=best_party_driver.user_id,
                    passenger_tripper_ids=[p.user_id for p in best_party_passengers],
                )
            )

        if valid and total_drive_time < best_total_drive_time:
            best_total_drive_time = total_drive_time
            best_solution = parties

    if best_solution is None:
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    return Solution(
        id=f"solution-{problem.id}",
        successfully_completed=True,
        feasible=True,
        optimal=False,
        parties=best_solution,
        total_drive_seconds=best_total_drive_time,
    )
