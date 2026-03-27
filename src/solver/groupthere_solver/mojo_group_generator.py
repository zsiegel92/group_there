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
from groupthere_solver.models import Tripper

# Search paths for the compiled Mojo shared library:
# - Local dev: mojo_app/ relative to this file's parent (src/solver/)
# - Modal: /mojo_app/ (absolute path in container)
_MOJO_MODULE_NAME = "group_generator_mojo_python_interface"
_MOJO_SEARCH_DIRS = [
    Path(__file__).resolve().parent.parent / "mojo_app",
    Path("/mojo_app"),
]


RawGroup: TypeAlias = tuple[
    list[int],  # All tripper indices in the feasible group, in (sorted) subset order.
    int,  # The chosen driver index within the original trippers list.
    list[int],  # Passenger tripper indices in the optimal pickup order.
    float,  # Total drive time in seconds for that driver + pickup order.
]


class RawGroupsResponse(RootModel[list[RawGroup]]):
    pass


class MojoGroupGeneratorModule(Protocol):
    def generate_feasible_groups_mojo(
        self,
        n: int,
        car_fits: list[int],
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

    # Pack data into flat lists for the Mojo interface
    car_fits = [t.car_fits for t in trippers]
    must_drive = [t.must_drive for t in trippers]
    distance_to_dest = [t.distance_to_destination_seconds for t in trippers]

    # Build n*n flat distance matrix (row-major: dist_matrix[i*n + j] = distance from i to j)
    # Use user_id ordering matching the trippers list
    dist_matrix = [0.0] * (n * n)
    for i, t1 in enumerate(trippers):
        for j, t2 in enumerate(trippers):
            if i != j:
                dist_matrix[i * n + j] = distance_lookup.get(
                    (t1.user_id, t2.user_id), 0.0
                )

    # Call Mojo
    raw_groups = _MOJO_MODULE.generate_feasible_groups_mojo(
        n,
        car_fits,
        must_drive,
        distance_to_dest,
        dist_matrix,
    )
    validated_groups = RawGroupsResponse.model_validate(raw_groups)

    # Convert back to FeasibleGroup objects
    feasible_groups: list[FeasibleGroup] = []
    for (
        tripper_indices,
        driver_index,
        passenger_indices,
        drive_time,
    ) in validated_groups.root:
        feasible_groups.append(
            FeasibleGroup(
                tripper_indices=tripper_indices,
                driver_index=driver_index,
                passenger_indices=passenger_indices,
                drive_time=drive_time,
            )
        )

    return feasible_groups
