import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, ProblemReceivedResponse, Solution
from groupthere_solver.solve import solve_problem


# CPU image with GLPK + CBC for standard MILP solving
cpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("glpk-utils", "coinor-cbc")
    .uv_sync()
    .add_local_python_source("groupthere_solver", copy=True)
)

# GPU image with cuOpt for GPU-accelerated MILP solving
cuopt_image = (
    modal.Image.from_registry(
        "nvidia/cuopt:latest-cuda13.0-py3.13",
        add_python="3.13",
    )
    .uv_sync()
    .uv_pip_install(
        "cuopt-sh-client",
        "cuopt-server-cu13",
        "cuopt-cu13==25.10.*",
        extra_index_url="https://pypi.nvidia.com",
    )
    .add_local_python_source("groupthere_solver", copy=True)
)

app = modal.App(
    name="groupthere-solver",
    image=cpu_image,
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
    assert solutions_are_equivalent(solution, mock_problem_expected_solution), (
        f"Expected solution with A driving B (5 min), but got: {solution}"
    )
    return solution


@app.function(
    cpu=4,
    memory=8_000,
    timeout=1800,
)
def solve_problem_remote(problem: Problem) -> Solution:
    return solve_problem(problem)


@app.function(
    image=cuopt_image,
    gpu="A100",
    memory=16_000,
    timeout=1800,
)
def solve_problem_cuopt(problem: Problem) -> Solution:
    return solve_problem(problem, milp_solver="cuopt")


@app.function(
    cpu=4,
    memory=8_000,
)
@modal.asgi_app()
def serve_webapp():
    return webapp
