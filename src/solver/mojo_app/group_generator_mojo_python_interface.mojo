"""
Mojo implementation of feasible group generation for carpooling optimization.

Exposed as a Python extension module via PythonModuleBuilder.
Business logic lives in `group_gen.mojo`; this file only handles Python interop.
"""

from group_gen import (
    INTS_PER_SLOT,
    MAX_K,
    NativeGeneratedGroups,
    NativeGroupGeneratorInputs,
    generate_feasible_groups_native,
)
from std.os import abort
from std.python import Python, PythonObject
from std.python.bindings import PythonModuleBuilder


@export
def PyInit_group_generator_mojo_python_interface() -> PythonObject:
    try:
        var m = PythonModuleBuilder("group_generator_mojo_python_interface")
        m.def_function[generate_feasible_groups_mojo](
            "generate_feasible_groups_mojo",
            docstring="Generate all feasible carpooling groups (parallel).",
        )
        return m.finalize()
    except e:
        abort(
            String(
                "error creating group_generator_mojo_python_interface module: ",
                e,
            )
        )


def generate_feasible_groups_mojo(
    py_n: PythonObject,  # Int
    py_can_drive: PythonObject,  # Python sequence[Bool]
    py_non_driver_seats: PythonObject,  # Python sequence[Int]
    py_must_drive: PythonObject,  # Python sequence[Bool]
    py_distance_to_dest: PythonObject,  # Python sequence[Float64], length n + 3
    py_dist_matrix: PythonObject,  # Python sequence[Float64]
) raises -> (
    PythonObject
):  # list[tuple[list[int], int, list[int], float, bool, float, float]]
    """
    Main Python entry point.

    Expected Python inputs:
    - py_n: int
    - py_can_drive: list[bool] with length n
    - py_non_driver_seats: list[int] with length n
    - py_must_drive: list[bool] with length n
    - py_distance_to_dest: list[float] with length n + 3. The final values are
      external rideshare cost multiplier (<1 disables), seats, and fixed cost.
    - py_dist_matrix: flat list[float] with length n * n in row-major order

    Returns:
    - list[tuple[list[int], int, list[int], float, bool, float, float]]
      Each tuple is (tripper_indices, driver_index, passenger_indices,
      drive_time, is_external_rideshare, assignment_cost, cost_multiplier).
    """
    print("Constructing groups in Mojo.")
    var native_inputs = _unpack_python_inputs(
        py_n,
        py_can_drive,
        py_non_driver_seats,
        py_must_drive,
        py_distance_to_dest,
        py_dist_matrix,
    )
    var native_groups = _generate_feasible_groups_native(native_inputs)
    return _pack_generated_groups_py(native_groups)


def _unpack_python_inputs(
    py_n: PythonObject,
    py_can_drive: PythonObject,
    py_non_driver_seats: PythonObject,
    py_must_drive: PythonObject,
    py_distance_to_dest: PythonObject,
    py_dist_matrix: PythonObject,
) raises -> NativeGroupGeneratorInputs:
    var n = Int(py=py_n)
    var can_drive_flags = alloc[Bool](n)
    var non_driver_seats = alloc[Int](n)
    var must_drive_flags = alloc[Bool](n)
    var distance_to_dest = alloc[Float64](n)
    var dist_matrix = alloc[Float64](n * n)
    var external_rideshare_cost_multiplier = Float64(py=py_distance_to_dest[n])
    var external_rideshare_seats = Int(py=py_distance_to_dest[n + 1])
    var external_rideshare_fixed_cost_seconds = Float64(
        py=py_distance_to_dest[n + 2]
    )

    for i in range(n):
        can_drive_flags[i] = Bool(py=py_can_drive[i])
        non_driver_seats[i] = Int(py=py_non_driver_seats[i])
        must_drive_flags[i] = Bool(py=py_must_drive[i])
        distance_to_dest[i] = Float64(py=py_distance_to_dest[i])

    for i in range(n * n):
        dist_matrix[i] = Float64(py=py_dist_matrix[i])

    return NativeGroupGeneratorInputs(
        n,
        can_drive_flags,
        non_driver_seats,
        must_drive_flags,
        distance_to_dest,
        dist_matrix,
        external_rideshare_cost_multiplier,
        external_rideshare_seats,
        external_rideshare_fixed_cost_seconds,
    )


def _generate_feasible_groups_native(
    inputs: NativeGroupGeneratorInputs,
) -> NativeGeneratedGroups:
    return generate_feasible_groups_native(
        inputs.n,
        inputs.can_drive_flags,
        inputs.non_driver_seats,
        inputs.must_drive_flags,
        inputs.distance_to_dest,
        inputs.dist_matrix,
        inputs.external_rideshare_cost_multiplier,
        inputs.external_rideshare_seats,
        inputs.external_rideshare_fixed_cost_seconds,
    )


def _pack_generated_groups_py(
    groups: NativeGeneratedGroups,
) raises -> PythonObject:
    var py_results = Python.list()
    for wi in range(groups.total_work):
        var slot = groups.result_slots + wi * INTS_PER_SLOT
        if slot[0] == 1:  # valid
            var k = Int(slot[1])
            var driver_idx = Int(slot[2])
            var is_external_rideshare = Bool(slot[3] == 1)
            var drive_time = groups.drive_times[wi]
            var assignment_cost = groups.assignment_costs[wi]
            var cost_multiplier = groups.cost_multipliers[wi]

            var py_tripper_indices = Python.list()
            for ti in range(k):
                _ = py_tripper_indices.append(Int(slot[4 + ti]))

            var py_passenger_indices = Python.list()
            var num_passengers = k - 1
            if is_external_rideshare:
                num_passengers = k
            for pi in range(num_passengers):
                _ = py_passenger_indices.append(Int(slot[4 + MAX_K + pi]))

            _ = py_results.append(
                Python.tuple(
                    py_tripper_indices,
                    driver_idx,
                    py_passenger_indices,
                    drive_time,
                    is_external_rideshare,
                    assignment_cost,
                    cost_multiplier,
                )
            )

    return py_results^
