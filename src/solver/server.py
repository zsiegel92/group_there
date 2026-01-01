import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, ProblemReceivedResponse, Solution
from groupthere_solver.solve import solve_problem

app = modal.App(
    name="groupthere-solver",
    image=modal.Image.debian_slim(
        python_version="3.12",
    )
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
@modal.asgi_app()
def serve_webapp():
    return webapp


@app.function()
def test_remote():
    print("Running on server!")
    return "Returning from server!"


@app.local_entrypoint()
def test_server():
    print(test_remote.remote())
