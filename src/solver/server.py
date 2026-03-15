import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, ProblemReceivedResponse, Solution
from groupthere_solver.solve import solve_problem


# Build the Modal image in dependency order so frequently-changed layers are last:
# 1. System deps (rarely change)
# 2. Pixi + Mojo toolchain (changes when pixi.toml changes)
# 3. Python deps via uv (changes when pyproject.toml changes)
# 4. Mojo source + build (changes when .mojo files change)
# 5. Python solver source (changes most often)
image = (
    modal.Image.from_registry("ubuntu:22.04", add_python="3.12")
    .apt_install("glpk-utils", "build-essential", "curl", "file")
    .pip_install("uv")
    .run_commands("uv pip install --compile-bytecode --system modal")
    # Install pixi for Mojo toolchain
    .run_commands("curl -fsSL https://pixi.sh/install.sh | sh")
    .env({"PATH": "/root/.pixi/bin:$PATH"})
    # Copy Mojo project and install toolchain (cached unless pixi.toml changes)
    .add_local_dir(
        "mojo_app",
        remote_path="/mojo_app",
        copy=True,
        ignore=["**/.pixi/*", "**/__mojocache__/*", "*.so", "*.dylib"],
    )
    .run_commands(
        [
            "cd /mojo_app && /root/.pixi/bin/pixi install",
            "cd /mojo_app && /root/.pixi/bin/pixi run pip install max",
            "cd /mojo_app && /root/.pixi/bin/pixi run mojo build group_generator.mojo --emit shared-lib -o group_generator.so",
            "file /mojo_app/group_generator.so",
        ]
    )
    # Python deps
    .uv_sync()
    # Python solver source (most frequently changed — last for fast rebuilds)
    .add_local_python_source("groupthere_solver", copy=True)
)

app = modal.App(
    name="groupthere-solver",
    image=image,
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
)
def solve_problem_remote(problem: Problem) -> Solution:
    return solve_problem(problem)


@app.function(
    cpu=4,
    memory=8_000,
)
@modal.asgi_app()
def serve_webapp():
    return webapp
