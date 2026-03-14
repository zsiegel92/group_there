"""
Bridge between the Python solver and the Mojo group generator.

This module provides `generate_feasible_groups_mojo` which has the same
interface as `generate_feasible_groups` in group_generator.py but delegates
the heavy computation to a precompiled Mojo shared library.
"""

import sys
from pathlib import Path

from groupthere_solver.group_generator import FeasibleGroup
from groupthere_solver.models import Tripper

# Search paths for the Mojo shared library:
# - Local dev: mojo_app/ relative to this file's parent (src/solver/)
# - Modal: /mojo_app/ (absolute path in container)
_MOJO_SEARCH_PATHS = [
    str(Path(__file__).resolve().parent.parent / "mojo_app"),
    "/mojo_app",
]


def _import_mojo_module():
    """Import the Mojo group_generator module, handling path setup."""
    for path in _MOJO_SEARCH_PATHS:
        if path not in sys.path:
            sys.path.insert(0, path)

    try:
        import max.mojo.importer  # noqa: F401
    except ImportError:
        pass  # If max isn't available, the pre-built .so may still work

    import group_generator  # type: ignore[import-untyped]

    return group_generator


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

    mojo_mod = _import_mojo_module()

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
    raw_groups = mojo_mod.generate_feasible_groups_mojo(
        n, car_fits, must_drive, distance_to_dest, dist_matrix
    )

    # Convert back to FeasibleGroup objects
    feasible_groups: list[FeasibleGroup] = []
    for group_tuple in raw_groups:
        tripper_indices = [int(x) for x in group_tuple[0]]
        driver_index = int(group_tuple[1])
        passenger_indices = [int(x) for x in group_tuple[2]]
        drive_time = float(group_tuple[3])

        feasible_groups.append(
            FeasibleGroup(
                tripper_indices=tripper_indices,
                driver_index=driver_index,
                passenger_indices=passenger_indices,
                drive_time=drive_time,
            )
        )

    return feasible_groups
