"""
Mojo implementation of feasible group generation for carpooling optimization.

Exposed as a Python extension module via PythonModuleBuilder.
Uses multi-threaded parallelism across subset enumeration.
"""

from std.os import abort
from std.python import Python, PythonObject
from std.python.bindings import PythonModuleBuilder
from std.algorithm import parallelize


comptime MAX_K = 6  # max group size (car_fits max=5 + driver)
comptime INTS_PER_SLOT = 3 + 2 * MAX_K  # valid, k, driver_idx, tripper[MAX_K], passenger[MAX_K]


@export
fn PyInit_group_generator() -> PythonObject:
    try:
        var m = PythonModuleBuilder("group_generator")
        m.def_function[generate_feasible_groups_mojo](
            "generate_feasible_groups_mojo",
            docstring="Generate all feasible carpooling groups (parallel).",
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

    # Unpack into raw pointer arrays for thread-safe reads
    var car_fits = alloc[Int](n)
    var must_drive_flags = alloc[Bool](n)
    var distance_to_dest = alloc[Float64](n)
    var dist_matrix = alloc[Float64](n * n)

    for i in range(n):
        car_fits[i] = Int(py=py_car_fits[i])
        must_drive_flags[i] = Bool(py_must_drive[i])
        distance_to_dest[i] = Float64(py=py_distance_to_dest[i])

    for i in range(n * n):
        dist_matrix[i] = Float64(py=py_dist_matrix[i])

    # Find max capacity
    var max_capacity = 0
    for i in range(n):
        if car_fits[i] > max_capacity:
            max_capacity = car_fits[i]
    var max_group_size = max_capacity + 1

    # Compute total work items across all group sizes
    var num_sizes = min(n, max_group_size)
    var size_offsets = alloc[Int](num_sizes + 1)
    var size_k_values = alloc[Int](num_sizes + 1)
    var total_work = 0

    for k in range(1, num_sizes + 1):
        size_offsets[k - 1] = total_work
        size_k_values[k - 1] = k
        total_work += _binomial(n, k)
    size_offsets[num_sizes] = total_work  # sentinel

    # Allocate flat result slots — one per work item
    var result_slots = alloc[Int64](total_work * INTS_PER_SLOT)
    var drive_times = alloc[Float64](total_work)

    # Zero the valid flags
    for i in range(total_work):
        result_slots[i * INTS_PER_SLOT] = 0
        drive_times[i] = 0.0

    @parameter
    fn process_work_item(work_idx: Int) capturing:
        # Find which group size this work item belongs to
        var k = 0
        var subset_idx = 0
        for si in range(num_sizes):
            if work_idx < size_offsets[si + 1]:
                k = size_k_values[si]
                subset_idx = work_idx - size_offsets[si]
                break

        # Generate the subset from its combinatorial index
        var group = alloc[Int](k)
        _unrank_combination(n, k, subset_idx, group)

        # Check feasibility and write into pre-allocated slot
        var slot = result_slots + work_idx * INTS_PER_SLOT
        _check_group_into_slot(
            group, k, n, car_fits, must_drive_flags, distance_to_dest, dist_matrix, slot, drive_times + work_idx
        )

        group.free()

    parallelize[process_work_item](total_work)

    # Collect results into Python
    var py_results = Python.list()
    for wi in range(total_work):
        var slot = result_slots + wi * INTS_PER_SLOT
        if slot[0] == 1:  # valid
            var k = Int(slot[1])
            var driver_idx = Int(slot[2])
            var drive_time = drive_times[wi]

            var py_tripper_indices = Python.list()
            for ti in range(k):
                _ = py_tripper_indices.append(Int(slot[3 + ti]))

            var py_passenger_indices = Python.list()
            var num_passengers = k - 1
            for pi in range(num_passengers):
                _ = py_passenger_indices.append(Int(slot[3 + MAX_K + pi]))

            _ = py_results.append(
                Python.tuple(py_tripper_indices, driver_idx, py_passenger_indices, drive_time)
            )

    # Free allocated memory
    car_fits.free()
    must_drive_flags.free()
    distance_to_dest.free()
    dist_matrix.free()
    size_offsets.free()
    size_k_values.free()
    result_slots.free()
    drive_times.free()

    return py_results^


def _check_group_into_slot(
    group: UnsafePointer[Int, MutAnyOrigin],
    k: Int,
    n: Int,
    car_fits: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    slot: UnsafePointer[Int64, MutAnyOrigin],
    drive_time_out: UnsafePointer[Float64, MutAnyOrigin],
):
    """Check feasibility and write result into the pre-allocated slot."""
    # Count must_drive in group
    var must_drive_count = 0
    var must_drive_idx = -1
    for gi in range(k):
        var idx = group[gi]
        if must_drive_flags[idx]:
            must_drive_count += 1
            must_drive_idx = idx

    if must_drive_count > 1:
        return

    # Find potential drivers
    var num_group_drivers = 0
    var group_drivers = alloc[Int](k)
    for gi in range(k):
        var idx = group[gi]
        if car_fits[idx] > 0:
            group_drivers[num_group_drivers] = idx
            num_group_drivers += 1

    if num_group_drivers == 0:
        group_drivers.free()
        return

    if must_drive_count == 1:
        var found = False
        for di in range(num_group_drivers):
            if group_drivers[di] == must_drive_idx:
                found = True
                break
        if not found:
            group_drivers.free()
            return
        group_drivers[0] = must_drive_idx
        num_group_drivers = 1

    # Try each driver
    var best_drive_time = Float64(1e18)
    var best_driver_idx = -1
    var best_passenger_order = alloc[Int](k)
    var candidate_passenger_order = alloc[Int](k)
    var passengers = alloc[Int](k)

    for di in range(num_group_drivers):
        var driver_idx = group_drivers[di]

        # Build passenger list
        var num_passengers = 0
        for gi in range(k):
            var idx = group[gi]
            if idx != driver_idx:
                passengers[num_passengers] = idx
                num_passengers += 1

        if num_passengers > car_fits[driver_idx]:
            continue

        # Check willingness
        var can_all_ride = True
        for pi in range(num_passengers):
            var p = passengers[pi]
            if car_fits[p] > 0 and must_drive_flags[p]:
                can_all_ride = False
                break
        if not can_all_ride:
            continue

        # Find optimal pickup order (writes into candidate buffer)
        var drive_time = _best_pickup_order_unsafe(
            driver_idx, passengers, num_passengers, n,
            distance_to_dest, dist_matrix, candidate_passenger_order
        )

        if drive_time < best_drive_time:
            best_drive_time = drive_time
            best_driver_idx = driver_idx
            # Copy candidate order to best order
            for pi in range(num_passengers):
                best_passenger_order[pi] = candidate_passenger_order[pi]

    if best_driver_idx >= 0:
        # Write result to slot
        slot[0] = 1  # valid
        slot[1] = Int64(k)
        slot[2] = Int64(best_driver_idx)
        drive_time_out[0] = best_drive_time

        for gi in range(k):
            slot[3 + gi] = Int64(group[gi])
        for pi in range(k - 1):
            slot[3 + MAX_K + pi] = Int64(best_passenger_order[pi])

    group_drivers.free()
    passengers.free()
    best_passenger_order.free()
    candidate_passenger_order.free()


def _best_pickup_order_unsafe(
    driver_idx: Int,
    passengers: UnsafePointer[Int, MutAnyOrigin],
    num_passengers: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    best_order_out: UnsafePointer[Int, MutAnyOrigin],
) -> Float64:
    """Find optimal pickup permutation. Writes best order to best_order_out."""
    if num_passengers == 0:
        return distance_to_dest[driver_idx]

    if num_passengers == 1:
        var p = passengers[0]
        best_order_out[0] = p
        return dist_matrix[driver_idx * n + p] + distance_to_dest[p]

    # Working permutation array
    var perm = alloc[Int](num_passengers)
    for i in range(num_passengers):
        perm[i] = passengers[i]

    var c = alloc[Int](num_passengers)
    for i in range(num_passengers):
        c[i] = 0

    var best_time = Float64(1e18)

    # Evaluate initial permutation
    var t = _eval_route(driver_idx, perm, num_passengers, n, distance_to_dest, dist_matrix)
    if t < best_time:
        best_time = t
        for j in range(num_passengers):
            best_order_out[j] = perm[j]

    # Heap's algorithm
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

            t = _eval_route(driver_idx, perm, num_passengers, n, distance_to_dest, dist_matrix)
            if t < best_time:
                best_time = t
                for j in range(num_passengers):
                    best_order_out[j] = perm[j]

            c[i] += 1
            i = 0
        else:
            c[i] = 0
            i += 1

    perm.free()
    c.free()
    return best_time


def _eval_route(
    driver_idx: Int,
    perm: UnsafePointer[Int, MutAnyOrigin],
    num_passengers: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
) -> Float64:
    """Calculate total drive time for a given pickup permutation."""
    var drive_time = Float64(0.0)
    var current = driver_idx

    for i in range(num_passengers):
        var next_stop = perm[i]
        drive_time += dist_matrix[current * n + next_stop]
        current = next_stop

    drive_time += distance_to_dest[current]
    return drive_time


# --- Combinatorial utilities ---

def _binomial(n: Int, k: Int) -> Int:
    """Compute C(n, k)."""
    if k > n or k < 0:
        return 0
    if k == 0 or k == n:
        return 1
    var kk = k
    if kk > n - kk:
        kk = n - kk
    var result = 1
    for i in range(kk):
        result = result * (n - i) // (i + 1)
    return result


def _unrank_combination(n: Int, k: Int, index: Int, out_buf: UnsafePointer[Int, MutAnyOrigin]):
    """Generate the index-th k-subset of {0..n-1} into out_buf."""
    var offset = 0
    var remaining = index

    for pos in range(k):
        while offset < n:
            var count = _binomial(n - offset - 1, k - pos - 1)
            if remaining < count:
                out_buf[pos] = offset
                offset += 1
                break
            else:
                remaining -= count
                offset += 1
