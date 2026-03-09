"""
Main solver for the carpooling optimization problem.

This module provides the entry point for solving carpooling problems using
a MILP-based approach:
1. Pre-compute all feasible groups with optimal pickup orders
2. Formulate and solve a MILP to assign trippers to groups
3. Convert the solution to the expected format
"""

from groupthere_solver.models import Problem, Solution, Party
from groupthere_solver.group_generator import generate_feasible_groups
from groupthere_solver.milp import solve_assignment


def solve_problem(problem: Problem) -> Solution:
    """
    Solve a carpooling optimization problem using MILP.

    The solver works in three phases:
    1. Generate all feasible groups (respecting capacity and must_drive constraints)
    2. For each group, find the optimal pickup order that minimizes drive time
    3. Solve a MILP to select groups such that each tripper is in exactly one group
       and total drive time is minimized

    Args:
        problem: The carpooling problem to solve

    Returns:
        A Solution containing the optimal party assignments and total drive time
    """
    # Handle empty problem
    if not problem.trippers:
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=True,
            optimal=True,
            parties=[],
            total_drive_seconds=0,
        )

    # Build distance lookup for O(1) access
    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    # Phase 1: Generate all feasible groups
    feasible_groups = generate_feasible_groups(problem.trippers, distance_lookup)

    if not feasible_groups:
        # No feasible groups exist
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    # Phase 2: Solve MILP to assign trippers to groups
    assignment = solve_assignment(len(problem.trippers), feasible_groups)

    if not assignment.feasible:
        return Solution(
            id=f"solution-{problem.id}",
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
        )

    # Phase 3: Convert to Solution format
    # group.drive_time already includes full car travel time
    # (pickup chain + destination leg), so we use assignment.total_drive_time directly
    parties = []
    for idx, group in enumerate(assignment.selected_groups):
        driver_user_id = problem.trippers[group.driver_index].user_id
        passenger_user_ids = [
            problem.trippers[i].user_id for i in group.passenger_indices
        ]

        parties.append(
            Party(
                id=f"party-{idx + 1}",
                driver_tripper_id=driver_user_id,
                passenger_tripper_ids=passenger_user_ids,
            )
        )

    return Solution(
        id=f"solution-{problem.id}",
        successfully_completed=True,
        feasible=True,
        optimal=assignment.optimal,
        parties=parties,
        total_drive_seconds=assignment.total_drive_time,
    )
