import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, ProblemReceivedResponse, Solution
from groupthere_solver.solve import solve_problem


app = modal.App(
    name="groupthere-solver",
    image=modal.Image.debian_slim(
        python_version="3.12",
    )
    .apt_install("glpk-utils")
    .uv_sync()
    .add_local_python_source(
        "groupthere_solver",
        copy=True,
    ),
    secrets=[modal.Secret.from_name("groupthere-solver-secrets")],
)


@webapp.post("/solve")
async def solve(problem: Problem) -> Solution:
    return solve_problem(problem)


@webapp.post("/solve-async")
async def solve_async(problem: Problem) -> ProblemReceivedResponse:
    # TODO: spawn solution
    # TODO: call function that hits NodeJS API with solution for webhook-style flow
    # TODO: maaaybe store state somewhere from Python service, either Modal dict or connect to db, probably Modal dict works. Only store solution if there's a poll-for-solution endpoint (versus the webhook-style flow)
    return ProblemReceivedResponse(
        problem_id=problem.id,
        successfully_received=True,
    )


@app.function()
def solve_test_problem() -> Solution:
    from groupthere_solver.mock_problem import (
        mock_problem,
        solutions_are_equivalent,
        mock_problem_expected_solution,
    )

    solution = solve_problem(mock_problem)
    assert solutions_are_equivalent(
        solution, mock_problem_expected_solution
    ), f"Expected solution with A driving B (5 min), but got: {solution}"
    return solution


@app.function(
    cpu=4,
    memory=8_000,
)
@modal.asgi_app()
def serve_webapp():
    return webapp
