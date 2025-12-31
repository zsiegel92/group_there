import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, Solution
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
