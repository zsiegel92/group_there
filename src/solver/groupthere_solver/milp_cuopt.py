"""
cuOpt GPU-accelerated MILP solver for the carpooling assignment problem.

This module uses NVIDIA cuOpt's low-level DataModel API to solve the same
set-cover-style MILP as milp.py, but on GPU. It is only usable on Modal
with GPU instances where cuopt is installed.

The cuopt-stubs package provides type information for local development.

We use the DataModel (numpy array) API instead of the high-level Problem API
because constructing 100K+ Variable objects in Python is extremely slow.
"""

import numpy as np
from cuopt import linear_programming
from cuopt.linear_programming.solver_settings import SolverSettings

from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.milp import AssignmentSolution

INFEASIBLE = AssignmentSolution(
    selected_groups=[],
    total_drive_time=0.0,
    feasible=False,
    optimal=False,
)


def solve_assignment_cuopt(
    num_trippers: int,
    feasible_groups: list[FeasibleGroup],
    *,
    mip_gap: float | None = None,
) -> AssignmentSolution:
    """
    Solve the carpooling assignment problem using NVIDIA cuOpt on GPU.

    Same formulation as milp.solve_assignment but using cuOpt's GPU solver:
    - Decision variables: x_i ∈ {0,1} for each feasible group i
    - Objective: minimize Σ(drive_time_i * x_i)
    - Constraints: Each tripper appears in exactly one selected group

    Uses the low-level DataModel API with numpy arrays for efficient
    construction of large problems (100K+ variables).
    """
    if not feasible_groups:
        return INFEASIBLE

    num_groups = len(feasible_groups)

    # Pre-check: every tripper must appear in at least one group
    tripper_groups: dict[int, list[int]] = {}
    for g_idx in range(num_groups):
        for t in feasible_groups[g_idx].tripper_indices:
            tripper_groups.setdefault(t, []).append(g_idx)

    for t in range(num_trippers):
        if t not in tripper_groups:
            return INFEASIBLE

    # Build constraint matrix in CSR format
    # Each row is a tripper constraint: sum of x[g] for groups containing tripper t == 1
    # All coefficients are 1.0 (binary membership)
    a_values_list: list[float] = []
    a_indices_list: list[int] = []
    a_offsets = [0]

    for t in range(num_trippers):
        groups_with_t = tripper_groups[t]
        for g in groups_with_t:
            a_values_list.append(1.0)
            a_indices_list.append(g)
        a_offsets.append(len(a_values_list))

    a_values = np.array(a_values_list, dtype=np.float64)
    a_indices = np.array(a_indices_list, dtype=np.int32)
    a_offsets_arr = np.array(a_offsets, dtype=np.int32)

    # Constraint bounds: all equality constraints (== 1)
    constraint_bounds = np.ones(num_trippers, dtype=np.float64)
    row_types = np.array(["E"] * num_trippers)

    # Objective coefficients: drive_time for each group
    obj_coefficients = np.array(
        [g.drive_time for g in feasible_groups], dtype=np.float64
    )

    # Variable bounds: all in [0, 1]
    var_lower = np.zeros(num_groups, dtype=np.float64)
    var_upper = np.ones(num_groups, dtype=np.float64)

    # Variable types: all integer (binary)
    var_types = np.array(["I"] * num_groups)

    # Assemble DataModel
    data_model = linear_programming.DataModel()
    data_model.set_csr_constraint_matrix(a_values, a_indices, a_offsets_arr)
    data_model.set_constraint_bounds(constraint_bounds)
    data_model.set_row_types(row_types)
    data_model.set_objective_coefficients(obj_coefficients)
    data_model.set_variable_lower_bounds(var_lower)
    data_model.set_variable_upper_bounds(var_upper)
    data_model.set_variable_types(var_types)

    # Configure solver
    # Parameter names: remove CUOPT_ prefix and lowercase
    # See https://docs.nvidia.com/cuopt/user-guide/latest/lp-milp-settings.html
    settings = SolverSettings()
    settings.set_parameter("time_limit", 600)
    if mip_gap is not None:
        settings.set_parameter("mip_relative_gap", mip_gap)

    # Solve
    try:
        solution = linear_programming.Solve(data_model, settings)
    except Exception:
        return INFEASIBLE

    # Check termination status
    termination = solution.get_termination_status()
    # MILPTerminationStatus: Optimal=1, FeasibleFound=4, Infeasible=5, etc.
    termination_reason = solution.get_termination_reason()
    reason_str = str(termination_reason) if termination_reason is not None else ""

    if "Optimal" in reason_str:
        is_optimal = True
        is_feasible = True
    elif "Infeasible" in reason_str or "Unbounded" in reason_str:
        return INFEASIBLE
    elif termination != 0:
        # Some non-zero status with a feasible solution (e.g. time limit)
        is_optimal = False
        is_feasible = True
    else:
        return INFEASIBLE

    # Extract selected groups from primal solution
    primal = solution.get_primal_solution()
    selected_groups = [
        feasible_groups[g_idx] for g_idx in range(num_groups) if primal[g_idx] > 0.5
    ]

    total_drive_time = sum(g.drive_time for g in selected_groups)

    return AssignmentSolution(
        selected_groups=selected_groups,
        total_drive_time=total_drive_time,
        feasible=is_feasible,
        optimal=is_optimal,
    )
