"""Placeholder module for future per-tripper commute optimization."""

from groupthere_solver.models import Problem, Solution


def solve_commute_problem(problem: Problem) -> Solution:
    return Solution(
        id=f"solution-{problem.id}",
        kind=problem.kind,
        successfully_completed=False,
        feasible=False,
        optimal=False,
        parties=[],
        total_drive_seconds=0,
        status_message="Commute solving is not implemented yet.",
    )
