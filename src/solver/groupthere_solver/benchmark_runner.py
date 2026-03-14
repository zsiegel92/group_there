"""
Core benchmark logic — runs a single solve and returns timing results as JSON.

This module lives inside groupthere_solver so it's available on Modal workers.
"""

import json
import time


def run_solve(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: str,
    mip_gap: float | None = None,
) -> str:
    """Run a single solve and return JSON string with timing results."""
    from groupthere_solver.group_generator import generate_feasible_groups
    from groupthere_solver.milp import solve_assignment
    from groupthere_solver.models import Problem

    problem = Problem.model_validate_json(problem_json)
    n = len(problem.trippers)

    # Build distance lookup
    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    # Phase 1: Group generation
    t0 = time.time()
    if use_mojo:
        try:
            from groupthere_solver.mojo_group_generator import (
                generate_feasible_groups_mojo,
            )

            feasible_groups = generate_feasible_groups_mojo(
                problem.trippers, distance_lookup
            )
            group_gen_method = "mojo"
        except Exception as e:
            print(f"Mojo fallback to Python: {e}")
            feasible_groups = generate_feasible_groups(
                problem.trippers, distance_lookup
            )
            group_gen_method = "python (mojo fallback)"
    else:
        feasible_groups = generate_feasible_groups(problem.trippers, distance_lookup)
        group_gen_method = "python"
    t1 = time.time()
    group_gen_seconds = t1 - t0
    num_groups = len(feasible_groups)

    if not feasible_groups:
        return json.dumps(
            {
                "num_trippers": n,
                "group_gen_method": group_gen_method,
                "milp_solver": milp_solver,
                "mip_gap": mip_gap,
                "mip_gap_label": _format_gap(mip_gap),
                "num_groups": 0,
                "group_gen_seconds": group_gen_seconds,
                "milp_solve_seconds": 0,
                "total_seconds": group_gen_seconds,
                "feasible": False,
                "optimal": False,
                "total_drive_seconds": 0,
                "num_parties": 0,
            }
        )

    # Phase 2: MILP solve
    t2 = time.time()
    if milp_solver == "cuopt":
        from groupthere_solver.milp_cuopt import solve_assignment_cuopt

        assignment = solve_assignment_cuopt(n, feasible_groups, mip_gap=mip_gap)
    else:
        assignment = solve_assignment(
            n,
            feasible_groups,
            solver=milp_solver,  # type: ignore[arg-type]
            mip_gap=mip_gap,
        )
    t3 = time.time()
    milp_solve_seconds = t3 - t2

    return json.dumps(
        {
            "num_trippers": n,
            "group_gen_method": group_gen_method,
            "milp_solver": milp_solver,
            "mip_gap": mip_gap,
            "mip_gap_label": _format_gap(mip_gap),
            "num_groups": num_groups,
            "group_gen_seconds": round(group_gen_seconds, 4),
            "milp_solve_seconds": round(milp_solve_seconds, 4),
            "total_seconds": round(group_gen_seconds + milp_solve_seconds, 4),
            "feasible": assignment.feasible,
            "optimal": assignment.optimal,
            "total_drive_seconds": round(assignment.total_drive_time, 1),
            "num_parties": len(assignment.selected_groups),
        }
    )


def _format_gap(gap: float | None) -> str:
    if gap is None:
        return "optimal"
    return f"{gap * 100:.1f}%"
