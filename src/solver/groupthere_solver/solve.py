from random import randint
from groupthere_solver.models import Problem, Solution


def solve_problem(problem: Problem) -> Solution:
    return Solution(
        id=f"random-from-python-{randint(1, 1000000)}",
        parties=[],
        total_drive_seconds=0,
    )
