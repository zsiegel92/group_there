import modal
from groupthere_solver.fastapi_utils import webapp
from groupthere_solver.models import Problem, ProblemReceivedResponse, Solution
from groupthere_solver.solve import solve_problem
from groupthere_solver.milp import MilpSolver

# Single image with everything: GLPK, CBC, Mojo, and cuOpt.
# Runtime parameters control which solver/group generator is used.
# Layer order optimized for cache hits (most-changed layers last):
# 1. System deps + CUDA base (rarely change)
# 2. Pixi + Mojo toolchain
# 3. Python deps via uv + cuOpt pip packages
# 4. Mojo source + build
# 5. Python solver source (changes most often)
image = (
    modal.Image.from_registry(
        "nvidia/cuopt:latest-cuda13.0-py3.13",
        add_python="3.13",
    )
    .apt_install("glpk-utils", "coinor-cbc", "build-essential", "curl", "file")
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
    # Python deps + cuOpt
    .uv_sync()
    .uv_pip_install(
        "cuopt-sh-client",
        "cuopt-server-cu13",
        "cuopt-cu13==25.10.*",
        extra_index_url="https://pypi.nvidia.com",
    )
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
    timeout=1800,
)
def solve_problem_remote(
    problem: Problem,
    *,
    use_mojo: bool = True,
    milp_solver: MilpSolver = "cbc",
    mip_gap: float | None = None,
) -> Solution:
    return solve_problem(
        problem, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(
    gpu="A100",
    memory=16_000,
    timeout=1800,
)
def solve_problem_gpu(
    problem: Problem,
    *,
    use_mojo: bool = True,
    milp_solver: MilpSolver = "cuopt",
    mip_gap: float | None = None,
) -> Solution:
    return solve_problem(
        problem, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(
    cpu=4,
    memory=8_000,
)
@modal.asgi_app()
def serve_webapp():
    return webapp


# ---------- Benchmark functions (different hardware configs) ----------
# These are called by benchmark.py's local entrypoint via .spawn()


def _benchmark_solve(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    from groupthere_solver.benchmark_runner import run_solve

    return run_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(cpu=2, memory=4_000, timeout=1800)
def benchmark_cpu_2c4g(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    return _benchmark_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(cpu=4, memory=8_000, timeout=1800)
def benchmark_cpu_4c8g(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    return _benchmark_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(cpu=8, memory=16_000, timeout=1800)
def benchmark_cpu_8c16g(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    return _benchmark_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(gpu="A10G", memory=16_000, timeout=1800)
def benchmark_gpu_a10g(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    return _benchmark_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )


@app.function(gpu="A100", memory=16_000, timeout=1800)
def benchmark_gpu_a100(
    problem_json: str,
    *,
    use_mojo: bool,
    milp_solver: MilpSolver,
    mip_gap: float | None,
) -> str:
    return _benchmark_solve(
        problem_json, use_mojo=use_mojo, milp_solver=milp_solver, mip_gap=mip_gap
    )
