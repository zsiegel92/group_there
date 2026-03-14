"""
Mojo implementation of feasible group generation for carpooling optimization.

Exposed as a Python extension module via PythonModuleBuilder.
The main entry point is `generate_feasible_groups_mojo` which takes:
  - n: number of trippers
  - car_fits: list of int (seats per tripper, 0 = no car)
  - must_drive: list of bool
  - distance_to_dest: list of float (direct drive time to event)
  - dist_matrix: flat list of float (n*n pairwise distances, row-major)

Returns a Python list of tuples:
  (tripper_indices: list[int], driver_index: int, passenger_indices: list[int], drive_time: float)
"""

from std.os import abort
from std.python import Python, PythonObject
from std.python.bindings import PythonModuleBuilder


@export
fn PyInit_group_generator() -> PythonObject:
    try:
        var m = PythonModuleBuilder("group_generator")
        m.def_function[generate_feasible_groups_mojo](
            "generate_feasible_groups_mojo",
            docstring="Generate all feasible carpooling groups.",
        )
        return m.finalize()
    except e:
        abort(String("error creating group_generator module: ", e))


def generate_feasible_groups_mojo(
    py_n: PythonObject,
    py_car_fits: PythonObject,
    py_must_drive: PythonObject,
    py_distance_to_dest: PythonObject,
    py_dist_matrix: PythonObject,
) raises -> PythonObject:
    """Main entry point called from Python."""
    var n = Int(py=py_n)

    # Unpack Python lists into Mojo Lists for fast access
    var car_fits = List[Int]()
    var must_drive_flags = List[Bool]()
    var distance_to_dest = List[Float64]()
    var dist_matrix = List[Float64]()

    for i in range(n):
        car_fits.append(Int(py=py_car_fits[i]))
        must_drive_flags.append(Bool(py_must_drive[i]))
        distance_to_dest.append(Float64(py=py_distance_to_dest[i]))

    for i in range(n * n):
        dist_matrix.append(Float64(py=py_dist_matrix[i]))

    # Identify drivers and must_drive
    var driver_indices = List[Int]()
    var must_drive_indices = List[Int]()
    var max_capacity = 0

    for i in range(n):
        if car_fits[i] > 0:
            driver_indices.append(i)
            if car_fits[i] > max_capacity:
                max_capacity = car_fits[i]
        if must_drive_flags[i]:
            must_drive_indices.append(i)

    var max_group_size = max_capacity + 1  # +1 for driver

    # Result accumulator
    var results = Python.list()

    # Generate all feasible groups by size
    for group_size in range(1, min(n, max_group_size) + 1):
        _enumerate_groups_of_size(
            n,
            group_size,
            car_fits,
            must_drive_flags,
            distance_to_dest,
            dist_matrix,
            driver_indices,
            must_drive_indices,
            results,
        )

    return results^


def _enumerate_groups_of_size(
    n: Int,
    k: Int,
    car_fits: List[Int],
    must_drive_flags: List[Bool],
    distance_to_dest: List[Float64],
    dist_matrix: List[Float64],
    driver_indices: List[Int],
    must_drive_indices: List[Int],
    mut results: PythonObject,
) raises:
    """Enumerate all k-subsets of {0..n-1} and check feasibility."""
    if k == 0 or k > n:
        return

    # indices[0..k-1] holds the current combination
    var indices = List[Int]()
    for i in range(k):
        indices.append(i)

    while True:
        _check_and_add_group(
            indices,
            k,
            n,
            car_fits,
            must_drive_flags,
            distance_to_dest,
            dist_matrix,
            driver_indices,
            must_drive_indices,
            results,
        )

        # Advance to next combination
        var i = k - 1
        while i >= 0 and indices[i] == n - k + i:
            i -= 1

        if i < 0:
            break

        indices[i] += 1
        for j in range(i + 1, k):
            indices[j] = indices[j - 1] + 1


def _check_and_add_group(
    group_indices: List[Int],
    k: Int,
    n: Int,
    car_fits: List[Int],
    must_drive_flags: List[Bool],
    distance_to_dest: List[Float64],
    dist_matrix: List[Float64],
    driver_indices: List[Int],
    must_drive_indices: List[Int],
    mut results: PythonObject,
) raises:
    """Check if a group is feasible and add it to results if so."""
    # Count must_drive in group
    var must_drive_count = 0
    var must_drive_idx = -1
    for gi in range(k):
        var idx = group_indices[gi]
        if must_drive_flags[idx]:
            must_drive_count += 1
            must_drive_idx = idx

    if must_drive_count > 1:
        return

    # Find potential drivers in this group
    var group_drivers = List[Int]()
    for gi in range(k):
        var idx = group_indices[gi]
        if car_fits[idx] > 0:
            group_drivers.append(idx)

    if len(group_drivers) == 0:
        return

    # If must_drive person exists, they must be the driver
    if must_drive_count == 1:
        var found = False
        for di in range(len(group_drivers)):
            if group_drivers[di] == must_drive_idx:
                found = True
                break
        if not found:
            return
        group_drivers = List[Int]()
        group_drivers.append(must_drive_idx)

    # Try each potential driver, find the best
    var best_drive_time = Float64(1e18)
    var best_driver_idx = -1
    var best_passenger_order = List[Int]()

    for di in range(len(group_drivers)):
        var driver_idx = group_drivers[di]

        # Build passenger list
        var passengers = List[Int]()
        for gi in range(k):
            var idx = group_indices[gi]
            if idx != driver_idx:
                passengers.append(idx)

        # Check capacity
        if len(passengers) > car_fits[driver_idx]:
            continue

        # Check if all passengers are willing to ride
        var can_all_ride = True
        for pi in range(len(passengers)):
            var p = passengers[pi]
            if car_fits[p] > 0 and must_drive_flags[p]:
                can_all_ride = False
                break
        if not can_all_ride:
            continue

        # Calculate optimal pickup order via permutations
        var result = _best_pickup_order(
            driver_idx, passengers, n, distance_to_dest, dist_matrix
        )
        var drive_time = result[0]

        if drive_time < best_drive_time:
            best_drive_time = drive_time
            best_driver_idx = driver_idx
            best_passenger_order = result[1].copy()

    if best_driver_idx >= 0:
        # Build Python tuple result
        var py_tripper_indices = Python.list()
        for gi in range(k):
            _ = py_tripper_indices.append(group_indices[gi])

        var py_passenger_indices = Python.list()
        for pi in range(len(best_passenger_order)):
            _ = py_passenger_indices.append(best_passenger_order[pi])

        var result_tuple = Python.tuple(
            py_tripper_indices, best_driver_idx, py_passenger_indices, best_drive_time
        )
        _ = results.append(result_tuple)


def _best_pickup_order(
    driver_idx: Int,
    passengers: List[Int],
    n: Int,
    distance_to_dest: List[Float64],
    dist_matrix: List[Float64],
) -> Tuple[Float64, List[Int]]:
    """Find the optimal pickup permutation minimizing total drive time."""
    var num_passengers = len(passengers)

    if num_passengers == 0:
        return (distance_to_dest[driver_idx], List[Int]())

    if num_passengers == 1:
        var p = passengers[0]
        var dt = dist_matrix[driver_idx * n + p] + distance_to_dest[p]
        var order = List[Int]()
        order.append(p)
        return (dt, order^)

    # Enumerate all permutations via Heap's algorithm
    var best_time = Float64(1e18)
    var best_perm = List[Int]()

    var perm = List[Int]()
    for i in range(num_passengers):
        perm.append(passengers[i])

    var c = List[Int]()
    for _ in range(num_passengers):
        c.append(0)

    # Evaluate initial permutation
    var t = _evaluate_route(driver_idx, perm, n, distance_to_dest, dist_matrix)
    if t < best_time:
        best_time = t
        best_perm = List[Int]()
        for i in range(num_passengers):
            best_perm.append(perm[i])

    var i = 0
    while i < num_passengers:
        if c[i] < i:
            if i % 2 == 0:
                var tmp = perm[0]
                perm[0] = perm[i]
                perm[i] = tmp
            else:
                var tmp = perm[c[i]]
                perm[c[i]] = perm[i]
                perm[i] = tmp

            t = _evaluate_route(driver_idx, perm, n, distance_to_dest, dist_matrix)
            if t < best_time:
                best_time = t
                best_perm = List[Int]()
                for j in range(num_passengers):
                    best_perm.append(perm[j])

            c[i] += 1
            i = 0
        else:
            c[i] = 0
            i += 1

    return (best_time, best_perm^)


def _evaluate_route(
    driver_idx: Int,
    perm: List[Int],
    n: Int,
    distance_to_dest: List[Float64],
    dist_matrix: List[Float64],
) -> Float64:
    """Calculate total drive time for a given pickup permutation."""
    var drive_time = Float64(0.0)
    var current = driver_idx

    for i in range(len(perm)):
        var next_stop = perm[i]
        drive_time += dist_matrix[current * n + next_stop]
        current = next_stop

    drive_time += distance_to_dest[current]
    return drive_time
