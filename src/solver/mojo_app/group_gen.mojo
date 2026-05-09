"""
Pure Mojo group-generation logic for carpooling optimization.

This module contains no Python interop and only uses Mojo-native inputs/outputs.
"""

from heap_permutation_iterator import HeapPermutationIterator
from std.algorithm import parallelize


comptime MAX_K = 6
comptime INTS_PER_SLOT = 4 + 2 * MAX_K


struct NativeGroupGeneratorInputs:
    var n: Int
    var can_drive_flags: UnsafePointer[Bool, MutExternalOrigin]
    var non_driver_seats: UnsafePointer[Int, MutExternalOrigin]
    var must_drive_flags: UnsafePointer[Bool, MutExternalOrigin]
    var distance_to_dest: UnsafePointer[Float64, MutExternalOrigin]
    var dist_matrix: UnsafePointer[Float64, MutExternalOrigin]
    var external_rideshare_cost_multiplier: Float64
    var external_rideshare_seats: Int
    var external_rideshare_fixed_cost_seconds: Float64

    def __init__(
        out self,
        n: Int,
        can_drive_flags: UnsafePointer[Bool, MutExternalOrigin],
        non_driver_seats: UnsafePointer[Int, MutExternalOrigin],
        must_drive_flags: UnsafePointer[Bool, MutExternalOrigin],
        distance_to_dest: UnsafePointer[Float64, MutExternalOrigin],
        dist_matrix: UnsafePointer[Float64, MutExternalOrigin],
        external_rideshare_cost_multiplier: Float64,
        external_rideshare_seats: Int,
        external_rideshare_fixed_cost_seconds: Float64,
    ):
        self.n = n
        self.can_drive_flags = can_drive_flags
        self.non_driver_seats = non_driver_seats
        self.must_drive_flags = must_drive_flags
        self.distance_to_dest = distance_to_dest
        self.dist_matrix = dist_matrix
        self.external_rideshare_cost_multiplier = (
            external_rideshare_cost_multiplier
        )
        self.external_rideshare_seats = external_rideshare_seats
        self.external_rideshare_fixed_cost_seconds = (
            external_rideshare_fixed_cost_seconds
        )

    def __del__(deinit self):
        self.can_drive_flags.free()
        self.non_driver_seats.free()
        self.must_drive_flags.free()
        self.distance_to_dest.free()
        self.dist_matrix.free()


struct NativeGeneratedGroups:
    var total_work: Int
    var result_slots: UnsafePointer[Int64, MutExternalOrigin]
    var drive_times: UnsafePointer[Float64, MutExternalOrigin]
    var assignment_costs: UnsafePointer[Float64, MutExternalOrigin]
    var cost_multipliers: UnsafePointer[Float64, MutExternalOrigin]

    def __init__(
        out self,
        total_work: Int,
        result_slots: UnsafePointer[Int64, MutExternalOrigin],
        drive_times: UnsafePointer[Float64, MutExternalOrigin],
        assignment_costs: UnsafePointer[Float64, MutExternalOrigin],
        cost_multipliers: UnsafePointer[Float64, MutExternalOrigin],
    ):
        self.total_work = total_work
        self.result_slots = result_slots
        self.drive_times = drive_times
        self.assignment_costs = assignment_costs
        self.cost_multipliers = cost_multipliers

    def __del__(deinit self):
        self.result_slots.free()
        self.drive_times.free()
        self.assignment_costs.free()
        self.cost_multipliers.free()


struct BinomialLookup:
    var max_n: Int
    var max_k: Int
    var stride: Int
    var table: UnsafePointer[Int, MutExternalOrigin]

    def __init__(out self, max_n: Int, max_k: Int):
        self.max_n = max_n
        self.max_k = max_k
        self.stride = max_k + 1
        self.table = alloc[Int]((max_n + 1) * self.stride)

        for n in range(max_n + 1):
            for k in range(self.stride):
                self._set(n, k, 0)

        for n in range(max_n + 1):
            self._set(n, 0, 1)
            var upper_k = min(n, max_k)
            for k in range(1, upper_k + 1):
                if k == n:
                    self._set(n, k, 1)
                else:
                    self._set(n, k, self.get(n - 1, k - 1) + self.get(n - 1, k))

    def __del__(deinit self):
        self.table.free()

    def _set(mut self, n: Int, k: Int, value: Int):
        self.table[n * self.stride + k] = value

    def get(self, n: Int, k: Int) -> Int:
        if k < 0 or k > n or n > self.max_n or k > self.max_k:
            return 0
        return self.table[n * self.stride + k]


struct HeapPermutations:
    comptime IteratorType[
        iterable_mut: Bool, //, iterable_origin: Origin[mut=iterable_mut]
    ] = HeapPermutationIterator

    var items: UnsafePointer[Int, MutAnyOrigin]
    var num_items: Int

    def __init__(
        out self,
        items: UnsafePointer[Int, MutAnyOrigin],
        num_items: Int,
    ):
        self.items = items
        self.num_items = num_items

    def __iter__(ref self) -> Self.IteratorType[origin_of(self)]:
        return HeapPermutationIterator(self.items, self.num_items)


def generate_feasible_groups_native(
    n: Int,
    can_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    non_driver_seats: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    external_rideshare_cost_multiplier: Float64,
    external_rideshare_seats: Int,
    external_rideshare_fixed_cost_seconds: Float64,
) -> NativeGeneratedGroups:
    var rideshare_enabled = external_rideshare_cost_multiplier >= 1.0

    var max_capacity = 0
    for i in range(n):
        if can_drive_flags[i] and non_driver_seats[i] > max_capacity:
            max_capacity = non_driver_seats[i]
    var max_participant_group_size = max_capacity + 1
    var max_rideshare_group_size = 0
    if rideshare_enabled:
        max_rideshare_group_size = external_rideshare_seats
    var max_group_size = max(
        max_participant_group_size, max_rideshare_group_size
    )

    var num_sizes = min(n, max_group_size)
    var binomial_lookup = BinomialLookup(n, num_sizes)
    var size_offsets = alloc[Int](num_sizes + 1)
    var size_k_values = alloc[Int](num_sizes + 1)
    var total_work = 0

    for k in range(1, num_sizes + 1):
        size_offsets[k - 1] = total_work
        size_k_values[k - 1] = k
        total_work += binomial_lookup.get(n, k)
    size_offsets[num_sizes] = total_work

    var result_slots = alloc[Int64](total_work * INTS_PER_SLOT)
    var drive_times = alloc[Float64](total_work)
    var assignment_costs = alloc[Float64](total_work)
    var cost_multipliers = alloc[Float64](total_work)

    for i in range(total_work):
        result_slots[i * INTS_PER_SLOT] = 0
        drive_times[i] = 0.0
        assignment_costs[i] = 0.0
        cost_multipliers[i] = 1.0

    @parameter
    def process_work_item(work_idx: Int) capturing:
        var k = 0
        var subset_idx = 0
        for si in range(num_sizes):
            if work_idx < size_offsets[si + 1]:
                k = size_k_values[si]
                subset_idx = work_idx - size_offsets[si]
                break

        var group = alloc[Int](k)
        _unrank_combination(n, k, subset_idx, group, binomial_lookup)

        var slot = result_slots + work_idx * INTS_PER_SLOT
        _check_group_into_slot(
            group,
            k,
            n,
            can_drive_flags,
            non_driver_seats,
            must_drive_flags,
            distance_to_dest,
            dist_matrix,
            rideshare_enabled,
            external_rideshare_cost_multiplier,
            external_rideshare_seats,
            external_rideshare_fixed_cost_seconds,
            slot,
            drive_times + work_idx,
            assignment_costs + work_idx,
            cost_multipliers + work_idx,
        )

        group.free()

    parallelize[process_work_item](total_work)

    size_offsets.free()
    size_k_values.free()

    return NativeGeneratedGroups(
        total_work,
        result_slots,
        drive_times,
        assignment_costs,
        cost_multipliers,
    )


def _check_group_into_slot(
    group: UnsafePointer[Int, MutAnyOrigin],
    k: Int,
    n: Int,
    can_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    non_driver_seats: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    rideshare_enabled: Bool,
    external_rideshare_cost_multiplier: Float64,
    external_rideshare_seats: Int,
    external_rideshare_fixed_cost_seconds: Float64,
    slot: UnsafePointer[Int64, MutAnyOrigin],
    drive_time_out: UnsafePointer[Float64, MutAnyOrigin],
    assignment_cost_out: UnsafePointer[Float64, MutAnyOrigin],
    cost_multiplier_out: UnsafePointer[Float64, MutAnyOrigin],
):
    var must_drive_count = 0
    var must_drive_idx = -1
    for gi in range(k):
        var idx = group[gi]
        if must_drive_flags[idx]:
            must_drive_count += 1
            must_drive_idx = idx

    if must_drive_count > 1:
        return

    var num_group_drivers = 0
    var group_drivers = alloc[Int](k)
    for gi in range(k):
        var idx = group[gi]
        if can_drive_flags[idx]:
            group_drivers[num_group_drivers] = idx
            num_group_drivers += 1

    if num_group_drivers == 0 and not rideshare_enabled:
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

    var best_drive_time = Float64(1e18)
    var best_assignment_cost = Float64(1e18)
    var best_driver_idx = -1
    var best_is_external_rideshare = False
    var best_num_passengers = k - 1
    var best_cost_multiplier = Float64(1.0)
    var best_passenger_order = alloc[Int](k)
    var candidate_passenger_order = alloc[Int](k)
    var passengers = alloc[Int](k)

    for di in range(num_group_drivers):
        var driver_idx = group_drivers[di]

        var num_passengers = 0
        for gi in range(k):
            var idx = group[gi]
            if idx != driver_idx:
                passengers[num_passengers] = idx
                num_passengers += 1

        if num_passengers > non_driver_seats[driver_idx]:
            continue

        var can_all_ride = True
        for pi in range(num_passengers):
            var p = passengers[pi]
            if must_drive_flags[p]:
                can_all_ride = False
                break
        if not can_all_ride:
            continue

        var drive_time = _best_pickup_order_unsafe(
            driver_idx,
            passengers,
            num_passengers,
            n,
            distance_to_dest,
            dist_matrix,
            candidate_passenger_order,
        )

        if drive_time < best_assignment_cost:
            best_drive_time = drive_time
            best_assignment_cost = drive_time
            best_driver_idx = driver_idx
            best_is_external_rideshare = False
            best_num_passengers = num_passengers
            best_cost_multiplier = 1.0
            for pi in range(num_passengers):
                best_passenger_order[pi] = candidate_passenger_order[pi]

    if (
        rideshare_enabled
        and must_drive_count == 0
        and k <= external_rideshare_seats
    ):
        var rideshare_order = alloc[Int](k)
        var rideshare_drive_time = _best_rideshare_order_unsafe(
            group,
            k,
            n,
            distance_to_dest,
            dist_matrix,
            rideshare_order,
        )
        var rideshare_assignment_cost = (
            rideshare_drive_time * external_rideshare_cost_multiplier
            + external_rideshare_fixed_cost_seconds
        )

        if rideshare_assignment_cost < best_assignment_cost:
            best_drive_time = rideshare_drive_time
            best_assignment_cost = rideshare_assignment_cost
            best_driver_idx = -1
            best_is_external_rideshare = True
            best_num_passengers = k
            best_cost_multiplier = external_rideshare_cost_multiplier
            for pi in range(k):
                best_passenger_order[pi] = rideshare_order[pi]

        rideshare_order.free()

    if best_driver_idx >= 0 or best_is_external_rideshare:
        slot[0] = 1
        slot[1] = Int64(k)
        slot[2] = Int64(best_driver_idx)
        if best_is_external_rideshare:
            slot[3] = 1
        else:
            slot[3] = 0
        drive_time_out[0] = best_drive_time
        assignment_cost_out[0] = best_assignment_cost
        cost_multiplier_out[0] = best_cost_multiplier

        for gi in range(k):
            slot[4 + gi] = Int64(group[gi])
        for pi in range(best_num_passengers):
            slot[4 + MAX_K + pi] = Int64(best_passenger_order[pi])

    group_drivers.free()
    passengers.free()
    best_passenger_order.free()
    candidate_passenger_order.free()


def _best_rideshare_order_unsafe(
    group: UnsafePointer[Int, MutAnyOrigin],
    k: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    best_order_out: UnsafePointer[Int, MutAnyOrigin],
) -> Float64:
    if k == 1:
        var rider = group[0]
        best_order_out[0] = rider
        return distance_to_dest[rider]

    var riders = alloc[Int](k)
    for i in range(k):
        riders[i] = group[i]

    var best_time = Float64(1e18)
    for perm in HeapPermutations(riders, k):
        var t = _eval_route(
            perm[0],
            perm + 1,
            k - 1,
            n,
            distance_to_dest,
            dist_matrix,
        )
        if t < best_time:
            best_time = t
            for j in range(k):
                best_order_out[j] = perm[j]

    riders.free()
    return best_time


def _best_pickup_order_unsafe(
    driver_idx: Int,
    passengers: UnsafePointer[Int, MutAnyOrigin],
    num_passengers: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    best_order_out: UnsafePointer[Int, MutAnyOrigin],
) -> Float64:
    if num_passengers == 0:
        return distance_to_dest[driver_idx]

    if num_passengers == 1:
        var p = passengers[0]
        best_order_out[0] = p
        return dist_matrix[driver_idx * n + p] + distance_to_dest[p]

    var best_time = Float64(1e18)
    for perm in HeapPermutations(passengers, num_passengers):
        var t = _eval_route(
            driver_idx,
            perm,
            num_passengers,
            n,
            distance_to_dest,
            dist_matrix,
        )
        if t < best_time:
            best_time = t
            for j in range(num_passengers):
                best_order_out[j] = perm[j]

    return best_time


def _eval_route(
    driver_idx: Int,
    perm: UnsafePointer[Int, MutAnyOrigin],
    num_passengers: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
) -> Float64:
    var drive_time = Float64(0.0)
    var current = driver_idx

    for i in range(num_passengers):
        var next_stop = perm[i]
        drive_time += dist_matrix[current * n + next_stop]
        current = next_stop

    drive_time += distance_to_dest[current]
    return drive_time


def _unrank_combination(
    n: Int,
    k: Int,
    index: Int,
    out_buf: UnsafePointer[Int, MutAnyOrigin],
    binomial_lookup: BinomialLookup,
):
    var offset = 0
    var remaining = index

    for pos in range(k):
        while offset < n:
            var count = binomial_lookup.get(n - offset - 1, k - pos - 1)
            if remaining < count:
                out_buf[pos] = offset
                offset += 1
                break
            else:
                remaining -= count
                offset += 1
