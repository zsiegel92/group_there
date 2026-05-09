"""
Bridge between the Python solver and the Mojo group generator.

This module provides `generate_feasible_groups_mojo` which has the same
interface as `generate_feasible_groups` in group_generator.py but delegates
the heavy computation to a precompiled Mojo shared library.
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType
from typing import Protocol, TypeAlias, cast

from pydantic import RootModel
from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.models import Problem, Solution, Tripper
from groupthere_solver.solution_builder import build_parties

# Search paths for the compiled Mojo shared library:
# - Local dev: mojo_app/ relative to this file's parent (src/solver/)
# - Modal: /solver/mojo_app/ in the current shared-manifest image layout
# - /mojo_app/ fallback search path
_MOJO_MODULE_NAME = "group_generator_mojo_python_interface"
_MOJO_SEARCH_DIRS = [
    Path(__file__).resolve().parent.parent / "mojo_app",
    Path("/solver/mojo_app"),
    Path("/mojo_app"),
]


RawGroup: TypeAlias = tuple[
    list[int],  # All tripper indices in the feasible group, in (sorted) subset order.
    int,  # The chosen driver index, or -1 for an external rideshare.
    list[int],  # Passenger tripper indices in the optimal pickup order.
    float,  # Actual route drive time in seconds for that pickup order.
    bool,  # Whether this group uses an external rideshare.
    float,  # Preference-weighted assignment cost in seconds.
    float,  # Cost multiplier used for this group.
]


class RawGroupsResponse(RootModel[list[RawGroup]]):
    pass


RawHeuristicResponse: TypeAlias = tuple[
    bool,  # feasible
    list[RawGroup],  # selected groups
]


class RawHeuristicResponseModel(RootModel[RawHeuristicResponse]):
    pass


class MojoGroupGeneratorModule(Protocol):
    def generate_feasible_groups_mojo(
        self,
        n: int,
        can_drive: list[bool],
        non_driver_seats: list[int],
        must_drive: list[bool],
        distance_to_dest: list[float],
        dist_matrix: list[float],
    ) -> object: ...

    def solve_shared_destination_heuristic_mojo(
        self,
        n: int,
        can_drive: list[bool],
        non_driver_seats: list[int],
        must_drive: list[bool],
        distance_to_dest: list[float],
        dist_matrix: list[float],
    ) -> object: ...


def _load_mojo_module() -> MojoGroupGeneratorModule:
    """Load the compiled Mojo extension module directly from disk."""
    for search_dir in _MOJO_SEARCH_DIRS:
        module_path = search_dir / f"{_MOJO_MODULE_NAME}.so"
        if not module_path.exists():
            continue

        spec = spec_from_file_location(_MOJO_MODULE_NAME, module_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Could not create import spec for {module_path}")

        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        return cast(MojoGroupGeneratorModule, cast(ModuleType, module))

    searched_paths = ", ".join(
        str(search_dir / f"{_MOJO_MODULE_NAME}.so") for search_dir in _MOJO_SEARCH_DIRS
    )
    raise ModuleNotFoundError(
        f"Could not find compiled Mojo module {_MOJO_MODULE_NAME!r}. "
        f"Searched: {searched_paths}"
    )


try:
    _MOJO_MODULE: MojoGroupGeneratorModule | None = _load_mojo_module()
    _MOJO_IMPORT_ERROR: Exception | None = None
except Exception as exc:
    _MOJO_MODULE = None
    _MOJO_IMPORT_ERROR = exc


def generate_feasible_groups_mojo(
    trippers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
    external_rideshare_cost_multiplier: float | None = None,
    external_rideshare_seats: int = 3,
    external_rideshare_fixed_cost_seconds: float = 0.0,
) -> list[FeasibleGroup]:
    """
    Generate all feasible groups using the Mojo implementation.

    Same interface as group_generator.generate_feasible_groups but faster.
    """
    n = len(trippers)
    if n == 0:
        return []

    if _MOJO_MODULE is None:
        raise RuntimeError(
            "Failed to import compiled Mojo module"
        ) from _MOJO_IMPORT_ERROR

    (
        can_drive,
        non_driver_seats,
        must_drive,
        distance_to_dest,
        dist_matrix,
    ) = _pack_mojo_inputs(
        trippers,
        distance_lookup,
        external_rideshare_cost_multiplier,
        external_rideshare_seats,
        external_rideshare_fixed_cost_seconds,
    )

    # Call Mojo
    raw_groups = _MOJO_MODULE.generate_feasible_groups_mojo(
        n,
        can_drive,
        non_driver_seats,
        must_drive,
        distance_to_dest,
        dist_matrix,
    )
    validated_groups = RawGroupsResponse.model_validate(raw_groups)

    return _raw_groups_to_feasible_groups(validated_groups.root)


def solve_shared_destination_heuristic_mojo(problem: Problem) -> Solution:
    """Solve a shared-destination problem with the Mojo greedy heuristic."""
    if problem.kind != "shared_destination":
        raise ValueError("The Mojo heuristic only supports shared-destination problems")

    if not problem.trippers:
        return Solution(
            id=f"heuristic-solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=True,
            optimal=True,
            parties=[],
            total_drive_seconds=0,
            status_message="Solved by Mojo heuristic.",
        )

    if _MOJO_MODULE is None:
        raise RuntimeError(
            "Failed to import compiled Mojo module"
        ) from _MOJO_IMPORT_ERROR

    distance_lookup: dict[tuple[str, str], float] = {}
    for dist in problem.tripper_distances:
        distance_lookup[(dist.origin_user_id, dist.destination_user_id)] = (
            dist.distance_seconds
        )

    rideshare_cost_multiplier = (
        problem.external_rideshare_cost_multiplier
        if problem.external_rideshare_mode != "disabled"
        else None
    )

    (
        can_drive,
        non_driver_seats,
        must_drive,
        distance_to_dest,
        dist_matrix,
    ) = _pack_mojo_inputs(
        problem.trippers,
        distance_lookup,
        rideshare_cost_multiplier,
        problem.external_rideshare_seats,
        problem.external_rideshare_fixed_cost_seconds,
    )

    raw_response = _MOJO_MODULE.solve_shared_destination_heuristic_mojo(
        len(problem.trippers),
        can_drive,
        non_driver_seats,
        must_drive,
        distance_to_dest,
        dist_matrix,
    )
    feasible, raw_groups = RawHeuristicResponseModel.model_validate(raw_response).root

    if not feasible:
        return Solution(
            id=f"heuristic-solution-{problem.id}",
            kind=problem.kind,
            successfully_completed=True,
            feasible=False,
            optimal=False,
            parties=[],
            total_drive_seconds=0,
            status_message="Mojo heuristic could not build a feasible solution.",
        )

    selected_groups = _raw_groups_to_feasible_groups(raw_groups)
    parties = build_parties(problem.trippers, selected_groups)
    external_rideshare_groups = [
        group for group in selected_groups if group.vehicle_kind == "external_rideshare"
    ]

    return Solution(
        id=f"heuristic-solution-{problem.id}",
        kind=problem.kind,
        successfully_completed=True,
        feasible=True,
        optimal=False,
        parties=parties,
        total_drive_seconds=sum(group.drive_time for group in selected_groups),
        external_rideshare_vehicle_count=len(external_rideshare_groups),
        total_external_rideshare_seconds=sum(
            group.drive_time for group in external_rideshare_groups
        ),
        total_external_rideshare_cost_seconds=sum(
            group.assignment_cost_seconds for group in external_rideshare_groups
        ),
        status_message="Solved by Mojo heuristic.",
    )


def _pack_mojo_inputs(
    trippers: list[Tripper],
    distance_lookup: dict[tuple[str, str], float],
    external_rideshare_cost_multiplier: float | None,
    external_rideshare_seats: int,
    external_rideshare_fixed_cost_seconds: float,
) -> tuple[list[bool], list[int], list[bool], list[float], list[float]]:
    n = len(trippers)
    can_drive = [t.can_drive for t in trippers]
    non_driver_seats = [t.non_driver_seats for t in trippers]
    must_drive = [t.must_drive for t in trippers]
    distance_to_dest = [t.distance_to_destination_seconds for t in trippers] + [
        (
            -1.0
            if external_rideshare_cost_multiplier is None
            else external_rideshare_cost_multiplier
        ),
        float(external_rideshare_seats),
        external_rideshare_fixed_cost_seconds,
    ]

    # Row-major matrix: dist_matrix[i*n + j] is the drive from tripper i to j.
    dist_matrix = [0.0] * (n * n)
    for i, t1 in enumerate(trippers):
        for j, t2 in enumerate(trippers):
            if i != j:
                dist_matrix[i * n + j] = distance_lookup.get(
                    (t1.user_id, t2.user_id), 0.0
                )

    return can_drive, non_driver_seats, must_drive, distance_to_dest, dist_matrix


def _raw_groups_to_feasible_groups(raw_groups: list[RawGroup]) -> list[FeasibleGroup]:
    feasible_groups: list[FeasibleGroup] = []
    for (
        tripper_indices,
        driver_index,
        passenger_indices,
        drive_time,
        is_external_rideshare,
        assignment_cost_seconds,
        cost_multiplier,
    ) in raw_groups:
        feasible_groups.append(
            FeasibleGroup(
                tripper_indices=tripper_indices,
                driver_index=None if is_external_rideshare else driver_index,
                passenger_indices=passenger_indices,
                drive_time=drive_time,
                vehicle_kind=(
                    "external_rideshare"
                    if is_external_rideshare
                    else "participant_vehicle"
                ),
                assignment_cost_seconds=assignment_cost_seconds,
                cost_multiplier=cost_multiplier,
            )
        )

    return feasible_groups
