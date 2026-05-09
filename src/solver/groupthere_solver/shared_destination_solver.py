"""
Solver for the current shared-destination carpooling problem.

This module contains the existing event solver algorithm. New trip variants
should plug into solve.py rather than adding conditionals here.
"""

import time

from groupthere_solver.group_generator import generate_feasible_groups
from groupthere_solver.milp import MilpSolver, solve_assignment
from groupthere_solver.models import Problem, Solution
from groupthere_solver.solution_builder import build_parties


def solve_shared_destination_problem(
    problem: Problem,
    *,
    use_mojo: bool = True,
    milp_solver: MilpSolver = "cbc",
    mip_gap: float | None = None,
) -> Solution:
    """
    Solve a shared-destination carpooling optimization problem using MILP.

    The solver works in three phases:
    1. Generate all feasible groups (respecting capacity and must_drive constraints)
    2. For each group, find the optimal pickup order that minimizes drive time
    3. Solve a MILP to select groups such that each tripper is in exactly one group
       and total drive time is minimized
    """
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

    start = time.time()
    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    rideshare_cost_multiplier = (
        problem.external_rideshare_cost_multiplier
        if problem.external_rideshare_mode != "disabled"
        else None
    )

    if use_mojo:
        try:
            from groupthere_solver.mojo_group_generator import (
                generate_feasible_groups_mojo,
            )

            feasible_groups = generate_feasible_groups_mojo(
                problem.trippers,
                distance_lookup,
                rideshare_cost_multiplier,
                problem.external_rideshare_seats,
                problem.external_rideshare_fixed_cost_seconds,
            )
        except Exception as e:
            print(f"Mojo group generator failed ({e}), falling back to Python")
            feasible_groups = generate_feasible_groups(
                problem.trippers,
                distance_lookup,
                rideshare_cost_multiplier,
                problem.external_rideshare_seats,
                problem.external_rideshare_fixed_cost_seconds,
            )
    else:
        feasible_groups = generate_feasible_groups(
            problem.trippers,
            distance_lookup,
            rideshare_cost_multiplier,
            problem.external_rideshare_seats,
            problem.external_rideshare_fixed_cost_seconds,
        )

    constructed_groups_end = time.time()
    print(
        f"Generated {len(feasible_groups)} feasible groups, took {constructed_groups_end - start:.2f} seconds"
    )
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

    if milp_solver == "cuopt":
        from groupthere_solver.milp_cuopt import solve_assignment_cuopt

        assignment = solve_assignment_cuopt(
            len(problem.trippers), feasible_groups, mip_gap=mip_gap
        )
    else:
        assignment = solve_assignment(
            len(problem.trippers),
            feasible_groups,
            solver=milp_solver,
            mip_gap=mip_gap,
        )

    finished_milp = time.time()
    print(
        f"Solved MILP assignment, took {finished_milp - constructed_groups_end:.2f} seconds"
    )
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

    parties = build_parties(
        problem.trippers,
        assignment.selected_groups,
    )
    external_rideshare_groups = [
        group
        for group in assignment.selected_groups
        if group.vehicle_kind == "external_rideshare"
    ]

    print(
        f"Constructed solution with {len(parties)} parties, took {time.time() - finished_milp:.2f} seconds"
    )
    return Solution(
        id=f"solution-{problem.id}",
        kind=problem.kind,
        successfully_completed=True,
        feasible=True,
        optimal=assignment.optimal,
        parties=parties,
        total_drive_seconds=assignment.total_drive_time,
        external_rideshare_vehicle_count=len(external_rideshare_groups),
        total_external_rideshare_seconds=sum(
            group.drive_time for group in external_rideshare_groups
        ),
        total_external_rideshare_cost_seconds=sum(
            group.assignment_cost_seconds for group in external_rideshare_groups
        ),
    )
