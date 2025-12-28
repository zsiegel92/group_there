from app_infra import app
from models import Problem, Solution
from solve import solve_problem


@app.get("/")
def read_root():
    return {"message": "Hello, World!"}


@app.post("/solve")
def solve(problem: Problem)-> Solution:
    return solve_problem(problem)
