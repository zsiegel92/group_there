"""Dispatch entrypoint for trip optimization problem types."""

from groupthere_solver.commute_solver import solve_commute_problem
from groupthere_solver.milp import MilpSolver
from groupthere_solver.models import Problem, Solution
from groupthere_solver.shared_destination_solver import solve_shared_destination_problem


def solve_problem(
    problem: Problem,
    *,
    use_mojo: bool = True,
    milp_solver: MilpSolver = "cbc",
    mip_gap: float | None = None,
) -> Solution:
    if problem.kind == "commute":
        return solve_commute_problem(problem)

    return solve_shared_destination_problem(
        problem,
        use_mojo=use_mojo,
        milp_solver=milp_solver,
        mip_gap=mip_gap,
    )
