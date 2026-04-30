"""
Pure Mojo group-generation logic for carpooling optimization.

This module contains no Python interop and only uses Mojo-native inputs/outputs.
"""

from std.iter import StopIteration
from std.algorithm import parallelize


comptime MAX_K = 6
comptime INTS_PER_SLOT = 3 + 2 * MAX_K


struct NativeGroupGeneratorInputs:
    var n: Int
    var car_fits: UnsafePointer[Int, MutExternalOrigin]
    var must_drive_flags: UnsafePointer[Bool, MutExternalOrigin]
    var distance_to_dest: UnsafePointer[Float64, MutExternalOrigin]
    var dist_matrix: UnsafePointer[Float64, MutExternalOrigin]

    def __init__(
        out self,
        n: Int,
        car_fits: UnsafePointer[Int, MutExternalOrigin],
        must_drive_flags: UnsafePointer[Bool, MutExternalOrigin],
        distance_to_dest: UnsafePointer[Float64, MutExternalOrigin],
        dist_matrix: UnsafePointer[Float64, MutExternalOrigin],
    ):
        self.n = n
        self.car_fits = car_fits
        self.must_drive_flags = must_drive_flags
        self.distance_to_dest = distance_to_dest
        self.dist_matrix = dist_matrix

    def __del__(deinit self):
        self.car_fits.free()
        self.must_drive_flags.free()
        self.distance_to_dest.free()
        self.dist_matrix.free()


struct NativeGeneratedGroups:
    var total_work: Int
    var result_slots: UnsafePointer[Int64, MutExternalOrigin]
    var drive_times: UnsafePointer[Float64, MutExternalOrigin]

    def __init__(
        out self,
        total_work: Int,
        result_slots: UnsafePointer[Int64, MutExternalOrigin],
        drive_times: UnsafePointer[Float64, MutExternalOrigin],
    ):
        self.total_work = total_work
        self.result_slots = result_slots
        self.drive_times = drive_times

    def __del__(deinit self):
        self.result_slots.free()
        self.drive_times.free()


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


struct HeapPermutationIterator:
    comptime Element = UnsafePointer[Int, MutExternalOrigin]

    var num_items: Int
    var perm: UnsafePointer[Int, MutExternalOrigin]
    var c: UnsafePointer[Int, MutExternalOrigin]
    var i: Int
    var yielded_initial: Bool

    def __init__(
        out self,
        items: UnsafePointer[Int, MutAnyOrigin],
        num_items: Int,
    ):
        self.num_items = num_items
        self.perm = alloc[Int](num_items)
        self.c = alloc[Int](num_items)
        self.i = 0
        self.yielded_initial = False

        for idx in range(num_items):
            self.perm[idx] = items[idx]
            self.c[idx] = 0

    def __del__(deinit self):
        self.perm.free()
        self.c.free()

    def __has_next__(self) -> Bool:
        return not (self.yielded_initial and self.i >= self.num_items)

    def __next__(mut self) raises StopIteration -> Self.Element:
        if not self.yielded_initial:
            self.yielded_initial = True
            return self.perm

        while self.i < self.num_items:
            if self.c[self.i] < self.i:
                if self.i % 2 == 0:
                    var tmp = self.perm[0]
                    self.perm[0] = self.perm[self.i]
                    self.perm[self.i] = tmp
                else:
                    var swap_idx = self.c[self.i]
                    var tmp = self.perm[swap_idx]
                    self.perm[swap_idx] = self.perm[self.i]
                    self.perm[self.i] = tmp

                self.c[self.i] += 1
                self.i = 0
                return self.perm

            self.c[self.i] = 0
            self.i += 1

        raise StopIteration()


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
    car_fits: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
) -> NativeGeneratedGroups:
    var max_capacity = 0
    for i in range(n):
        if car_fits[i] > max_capacity:
            max_capacity = car_fits[i]
    var max_group_size = max_capacity + 1

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

    for i in range(total_work):
        result_slots[i * INTS_PER_SLOT] = 0
        drive_times[i] = 0.0

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
            car_fits,
            must_drive_flags,
            distance_to_dest,
            dist_matrix,
            slot,
            drive_times + work_idx,
        )

        group.free()

    parallelize[process_work_item](total_work)

    size_offsets.free()
    size_k_values.free()

    return NativeGeneratedGroups(total_work, result_slots, drive_times)


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

    var best_drive_time = Float64(1e18)
    var best_driver_idx = -1
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

        if num_passengers > car_fits[driver_idx]:
            continue

        var can_all_ride = True
        for pi in range(num_passengers):
            var p = passengers[pi]
            if car_fits[p] > 0 and must_drive_flags[p]:
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

        if drive_time < best_drive_time:
            best_drive_time = drive_time
            best_driver_idx = driver_idx
            for pi in range(num_passengers):
                best_passenger_order[pi] = candidate_passenger_order[pi]

    if best_driver_idx >= 0:
        slot[0] = 1
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
