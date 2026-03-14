"""
MILP formulation and solving for the carpooling assignment problem.

This module uses Pyomo to formulate and solve the problem of assigning
trippers to feasible groups to minimize total drive time.
"""

from typing import Literal

import pyomo.environ as pyo
from groupthere_solver.group_generator import FeasibleGroup

MilpSolver = Literal["glpk", "cbc", "cuopt"]


class AssignmentSolution:
    """
    Represents a solution to the carpooling assignment problem.

    Attributes:
        selected_groups: List of groups that were selected in the optimal solution
        total_drive_time: Total drive time across all selected groups (in seconds)
        feasible: Whether a feasible solution was found
        optimal: Whether the solution is proven optimal
    """

    def __init__(
        self,
        selected_groups: list[FeasibleGroup],
        total_drive_time: float,
        feasible: bool,
        optimal: bool,
    ):
        self.selected_groups = selected_groups
        self.total_drive_time = total_drive_time
        self.feasible = feasible
        self.optimal = optimal

    def __repr__(self) -> str:
        return (
            f"AssignmentSolution("
            f"groups={len(self.selected_groups)}, "
            f"time={self.total_drive_time:.1f}s, "
            f"feasible={self.feasible}, "
            f"optimal={self.optimal})"
        )


def solve_assignment(
    num_trippers: int,
    feasible_groups: list[FeasibleGroup],
    *,
    solver: MilpSolver = "glpk",
    mip_gap: float | None = None,
) -> AssignmentSolution:
    """
    Solve the carpooling assignment problem using MILP.

    The problem is formulated as:
    - Decision variables: x_i ∈ {0,1} for each feasible group i
    - Objective: minimize Σ(drive_time_i * x_i)
    - Constraints: Each tripper appears in exactly one selected group

    Args:
        num_trippers: Total number of trippers
        feasible_groups: List of all feasible groups to choose from

    Returns:
        The optimal (or best found) assignment solution
    """
    if not feasible_groups:
        # No feasible groups - return infeasible solution
        return AssignmentSolution(
            selected_groups=[],
            total_drive_time=0.0,
            feasible=False,
            optimal=False,
        )

    # Create Pyomo model
    model = pyo.ConcreteModel()

    # Sets
    model.GROUPS = pyo.Set(initialize=range(len(feasible_groups)))  # type: ignore
    model.TRIPPERS = pyo.Set(initialize=range(num_trippers))  # type: ignore

    # Decision variables: x[g] = 1 if group g is selected
    model.x = pyo.Var(model.GROUPS, domain=pyo.Binary)  # type: ignore

    # Objective: minimize total drive time
    def objective_rule(m):  # type: ignore
        return sum(
            feasible_groups[g].drive_time * m.x[g]  # type: ignore
            for g in m.GROUPS  # type: ignore
        )

    model.objective = pyo.Objective(rule=objective_rule, sense=pyo.minimize)  # type: ignore

    # Check if all trippers are covered by at least one group
    for t in range(num_trippers):
        groups_with_tripper = [
            g
            for g in range(len(feasible_groups))
            if t in feasible_groups[g].tripper_indices
        ]
        if not groups_with_tripper:
            # This tripper is not in any feasible group - problem is infeasible
            return AssignmentSolution(
                selected_groups=[],
                total_drive_time=0.0,
                feasible=False,
                optimal=False,
            )

    # Constraints: each tripper in exactly one group
    def tripper_coverage_rule(m, t):  # type: ignore
        # Find all groups containing tripper t
        groups_with_tripper = [
            g
            for g in m.GROUPS  # type: ignore
            if t in feasible_groups[g].tripper_indices
        ]
        return sum(m.x[g] for g in groups_with_tripper) == 1  # type: ignore

    model.tripper_coverage = pyo.Constraint(  # type: ignore
        model.TRIPPERS,  # type: ignore
        rule=tripper_coverage_rule,
    )

    # Solve the model
    pyomo_solver = pyo.SolverFactory(solver)

    if mip_gap is not None:
        if solver == "cbc":
            pyomo_solver.options["ratioGap"] = mip_gap
        elif solver == "glpk":
            pyomo_solver.options["mipgap"] = mip_gap

    try:
        results = pyomo_solver.solve(model, tee=False)
    except Exception:
        # Solver failed - return infeasible solution
        return AssignmentSolution(
            selected_groups=[],
            total_drive_time=0.0,
            feasible=False,
            optimal=False,
        )

    # Check solution status
    if (
        results.solver.status == pyo.SolverStatus.ok
        and results.solver.termination_condition == pyo.TerminationCondition.optimal
    ):
        # Optimal solution found
        is_optimal = True
        is_feasible = True
    elif (
        results.solver.termination_condition == pyo.TerminationCondition.infeasible
        or results.solver.termination_condition
        == pyo.TerminationCondition.infeasibleOrUnbounded
    ):
        # Problem is infeasible
        return AssignmentSolution(
            selected_groups=[],
            total_drive_time=0.0,
            feasible=False,
            optimal=False,
        )
    else:
        # Solution found but may not be optimal
        is_optimal = False
        is_feasible = True

    # Extract selected groups
    selected_groups = [
        feasible_groups[g]  # type: ignore
        for g in model.GROUPS  # type: ignore
        if pyo.value(model.x[g]) > 0.5  # type: ignore
    ]

    total_drive_time = sum(g.drive_time for g in selected_groups)

    return AssignmentSolution(
        selected_groups=selected_groups,
        total_drive_time=total_drive_time,
        feasible=is_feasible,
        optimal=is_optimal,
    )
