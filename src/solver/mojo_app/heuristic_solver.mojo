"""
Greedy Mojo heuristic for shared-destination carpool assignment.

This solver builds a feasible partition directly instead of generating every
feasible group and solving a MILP. It starts with mandatory drivers, repeatedly
adds the cheapest feasible rider insertion or new vehicle, then optimizes the
pickup order inside each selected vehicle.
"""

from group_gen import (
    INTS_PER_SLOT,
    MAX_K,
    _best_pickup_order_unsafe,
    _best_rideshare_order_unsafe,
)


struct NativeHeuristicGroups:
    var total_groups: Int
    var feasible: Bool
    var result_slots: UnsafePointer[Int64, MutExternalOrigin]
    var drive_times: UnsafePointer[Float64, MutExternalOrigin]
    var assignment_costs: UnsafePointer[Float64, MutExternalOrigin]
    var cost_multipliers: UnsafePointer[Float64, MutExternalOrigin]

    def __init__(
        out self,
        total_groups: Int,
        feasible: Bool,
        result_slots: UnsafePointer[Int64, MutExternalOrigin],
        drive_times: UnsafePointer[Float64, MutExternalOrigin],
        assignment_costs: UnsafePointer[Float64, MutExternalOrigin],
        cost_multipliers: UnsafePointer[Float64, MutExternalOrigin],
    ):
        self.total_groups = total_groups
        self.feasible = feasible
        self.result_slots = result_slots
        self.drive_times = drive_times
        self.assignment_costs = assignment_costs
        self.cost_multipliers = cost_multipliers

    def __del__(deinit self):
        self.result_slots.free()
        self.drive_times.free()
        self.assignment_costs.free()
        self.cost_multipliers.free()


struct BestMove:
    var found: Bool
    var inserts_into_existing_group: Bool
    var starts_participant_vehicle: Bool
    var starts_rideshare: Bool
    var rider: Int
    var group: Int
    var insert_pos: Int
    var incremental_cost: Float64
    var incremental_drive_time: Float64

    def __init__(out self):
        self.found = False
        self.inserts_into_existing_group = False
        self.starts_participant_vehicle = False
        self.starts_rideshare = False
        self.rider = 0
        self.group = 0
        self.insert_pos = 0
        self.incremental_cost = Float64(1e18)
        self.incremental_drive_time = Float64(0.0)

    def record_existing_group_insert(
        mut self,
        rider: Int,
        group: Int,
        insert_pos: Int,
        incremental_cost: Float64,
        incremental_drive_time: Float64,
    ):
        if incremental_cost >= self.incremental_cost:
            return

        self.found = True
        self.inserts_into_existing_group = True
        self.starts_participant_vehicle = False
        self.starts_rideshare = False
        self.rider = rider
        self.group = group
        self.insert_pos = insert_pos
        self.incremental_cost = incremental_cost
        self.incremental_drive_time = incremental_drive_time

    def record_participant_vehicle_start(
        mut self,
        rider: Int,
        direct_drive_time: Float64,
    ):
        if direct_drive_time >= self.incremental_cost:
            return

        self.found = True
        self.inserts_into_existing_group = False
        self.starts_participant_vehicle = True
        self.starts_rideshare = False
        self.rider = rider
        self.group = 0
        self.insert_pos = 0
        self.incremental_cost = direct_drive_time
        self.incremental_drive_time = direct_drive_time

    def record_rideshare_start(
        mut self,
        rider: Int,
        assignment_cost: Float64,
        direct_drive_time: Float64,
    ):
        if assignment_cost >= self.incremental_cost:
            return

        self.found = True
        self.inserts_into_existing_group = False
        self.starts_participant_vehicle = False
        self.starts_rideshare = True
        self.rider = rider
        self.group = 0
        self.insert_pos = 0
        self.incremental_cost = assignment_cost
        self.incremental_drive_time = direct_drive_time


def solve_shared_destination_heuristic_native(
    n: Int,
    can_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    non_driver_seats: UnsafePointer[Int, MutAnyOrigin],
    must_drive_flags: UnsafePointer[Bool, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    external_rideshare_cost_multiplier: Float64,
    external_rideshare_seats: Int,
    external_rideshare_fixed_cost_seconds: Float64,
) -> NativeHeuristicGroups:
    var rideshare_enabled = external_rideshare_cost_multiplier >= 1.0
    var max_groups = max(n, 1)

    var result_slots = alloc[Int64](max_groups * INTS_PER_SLOT)
    var result_drive_times = alloc[Float64](max_groups)
    var result_assignment_costs = alloc[Float64](max_groups)
    var result_cost_multipliers = alloc[Float64](max_groups)
    _clear_result_buffers(
        max_groups,
        result_slots,
        result_drive_times,
        result_assignment_costs,
        result_cost_multipliers,
    )

    var group_is_rideshare = alloc[Bool](max_groups)
    var group_driver = alloc[Int](max_groups)
    var group_count = alloc[Int](max_groups)
    var group_capacity = alloc[Int](max_groups)
    var group_members = alloc[Int](max_groups * MAX_K)
    var group_drive_times = alloc[Float64](max_groups)
    var group_assignment_costs = alloc[Float64](max_groups)
    var assigned = alloc[Bool](n)

    for i in range(n):
        assigned[i] = False

    var num_groups = 0
    var num_assigned = 0

    for i in range(n):
        if not must_drive_flags[i]:
            continue
        if not can_drive_flags[i]:
            _free_work_buffers(
                group_is_rideshare,
                group_driver,
                group_count,
                group_capacity,
                group_members,
                group_drive_times,
                group_assignment_costs,
                assigned,
            )
            return NativeHeuristicGroups(
                0,
                False,
                result_slots,
                result_drive_times,
                result_assignment_costs,
                result_cost_multipliers,
            )

        _append_participant_group(
            num_groups,
            i,
            non_driver_seats[i],
            distance_to_dest[i],
            group_is_rideshare,
            group_driver,
            group_count,
            group_capacity,
            group_drive_times,
            group_assignment_costs,
        )
        num_groups += 1
        assigned[i] = True
        num_assigned += 1

    while num_assigned < n:
        var best_move = BestMove()

        for rider in range(n):
            if assigned[rider]:
                continue

            if not must_drive_flags[rider]:
                for group_idx in range(num_groups):
                    if group_count[group_idx] >= group_capacity[group_idx]:
                        continue

                    var insert_pos = alloc[Int](1)
                    insert_pos[0] = 0
                    var incremental_drive_time = Float64(0.0)
                    var incremental_cost = Float64(0.0)

                    if not group_is_rideshare[group_idx]:
                        incremental_drive_time = _best_participant_insert_delta(
                            group_driver[group_idx],
                            group_members + group_idx * MAX_K,
                            group_count[group_idx],
                            rider,
                            n,
                            distance_to_dest,
                            dist_matrix,
                            insert_pos,
                        )
                        incremental_cost = incremental_drive_time
                    else:
                        incremental_drive_time = _best_rideshare_insert_delta(
                            group_members + group_idx * MAX_K,
                            group_count[group_idx],
                            rider,
                            n,
                            distance_to_dest,
                            dist_matrix,
                            insert_pos,
                        )
                        incremental_cost = (
                            incremental_drive_time
                            * external_rideshare_cost_multiplier
                        )

                    best_move.record_existing_group_insert(
                        rider,
                        group_idx,
                        insert_pos[0],
                        incremental_cost,
                        incremental_drive_time,
                    )

                    insert_pos.free()

            if can_drive_flags[rider]:
                best_move.record_participant_vehicle_start(
                    rider,
                    distance_to_dest[rider],
                )

            if rideshare_enabled and not must_drive_flags[rider]:
                var rideshare_cost = (
                    distance_to_dest[rider] * external_rideshare_cost_multiplier
                    + external_rideshare_fixed_cost_seconds
                )
                best_move.record_rideshare_start(
                    rider,
                    rideshare_cost,
                    distance_to_dest[rider],
                )

        if not best_move.found:
            _free_work_buffers(
                group_is_rideshare,
                group_driver,
                group_count,
                group_capacity,
                group_members,
                group_drive_times,
                group_assignment_costs,
                assigned,
            )
            return NativeHeuristicGroups(
                0,
                False,
                result_slots,
                result_drive_times,
                result_assignment_costs,
                result_cost_multipliers,
            )

        if best_move.inserts_into_existing_group:
            _insert_member(
                group_members + best_move.group * MAX_K,
                group_count[best_move.group],
                best_move.insert_pos,
                best_move.rider,
            )
            group_count[best_move.group] += 1
            group_drive_times[
                best_move.group
            ] += best_move.incremental_drive_time
            group_assignment_costs[
                best_move.group
            ] += best_move.incremental_cost
        elif best_move.starts_participant_vehicle:
            _append_participant_group(
                num_groups,
                best_move.rider,
                non_driver_seats[best_move.rider],
                distance_to_dest[best_move.rider],
                group_is_rideshare,
                group_driver,
                group_count,
                group_capacity,
                group_drive_times,
                group_assignment_costs,
            )
            num_groups += 1
        else:
            _append_rideshare_group(
                num_groups,
                best_move.rider,
                external_rideshare_seats,
                distance_to_dest[best_move.rider],
                external_rideshare_cost_multiplier,
                external_rideshare_fixed_cost_seconds,
                group_is_rideshare,
                group_driver,
                group_count,
                group_capacity,
                group_members,
                group_drive_times,
                group_assignment_costs,
            )
            num_groups += 1

        assigned[best_move.rider] = True
        num_assigned += 1

    _optimize_group_orders(
        num_groups,
        n,
        group_is_rideshare,
        group_driver,
        group_count,
        group_members,
        group_drive_times,
        group_assignment_costs,
        distance_to_dest,
        dist_matrix,
        external_rideshare_cost_multiplier,
        external_rideshare_fixed_cost_seconds,
    )

    _pack_groups(
        num_groups,
        group_is_rideshare,
        group_driver,
        group_count,
        group_members,
        group_drive_times,
        group_assignment_costs,
        result_slots,
        result_drive_times,
        result_assignment_costs,
        result_cost_multipliers,
        external_rideshare_cost_multiplier,
    )

    _free_work_buffers(
        group_is_rideshare,
        group_driver,
        group_count,
        group_capacity,
        group_members,
        group_drive_times,
        group_assignment_costs,
        assigned,
    )

    return NativeHeuristicGroups(
        num_groups,
        True,
        result_slots,
        result_drive_times,
        result_assignment_costs,
        result_cost_multipliers,
    )


def _append_participant_group(
    group_idx: Int,
    driver_idx: Int,
    seats: Int,
    direct_drive_time: Float64,
    group_is_rideshare: UnsafePointer[Bool, MutAnyOrigin],
    group_driver: UnsafePointer[Int, MutAnyOrigin],
    group_count: UnsafePointer[Int, MutAnyOrigin],
    group_capacity: UnsafePointer[Int, MutAnyOrigin],
    group_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    group_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
):
    group_is_rideshare[group_idx] = False
    group_driver[group_idx] = driver_idx
    group_count[group_idx] = 0
    group_capacity[group_idx] = min(seats, MAX_K)
    group_drive_times[group_idx] = direct_drive_time
    group_assignment_costs[group_idx] = direct_drive_time


def _append_rideshare_group(
    group_idx: Int,
    rider_idx: Int,
    seats: Int,
    direct_drive_time: Float64,
    cost_multiplier: Float64,
    fixed_cost_seconds: Float64,
    group_is_rideshare: UnsafePointer[Bool, MutAnyOrigin],
    group_driver: UnsafePointer[Int, MutAnyOrigin],
    group_count: UnsafePointer[Int, MutAnyOrigin],
    group_capacity: UnsafePointer[Int, MutAnyOrigin],
    group_members: UnsafePointer[Int, MutAnyOrigin],
    group_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    group_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
):
    group_is_rideshare[group_idx] = True
    group_driver[group_idx] = 0
    group_count[group_idx] = 1
    group_capacity[group_idx] = min(seats, MAX_K)
    group_members[group_idx * MAX_K] = rider_idx
    group_drive_times[group_idx] = direct_drive_time
    group_assignment_costs[group_idx] = (
        direct_drive_time * cost_multiplier + fixed_cost_seconds
    )


def _best_participant_insert_delta(
    driver_idx: Int,
    members: UnsafePointer[Int, MutAnyOrigin],
    count: Int,
    rider_idx: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    insert_pos_out: UnsafePointer[Int, MutAnyOrigin],
) -> Float64:
    var best_delta = Float64(1e18)

    for pos in range(count + 1):
        var before_idx = driver_idx
        if pos > 0:
            before_idx = members[pos - 1]

        var delta = Float64(0.0)
        if pos == count:
            delta = (
                dist_matrix[before_idx * n + rider_idx]
                + distance_to_dest[rider_idx]
                - distance_to_dest[before_idx]
            )
        else:
            var after_idx = members[pos]
            delta = (
                dist_matrix[before_idx * n + rider_idx]
                + dist_matrix[rider_idx * n + after_idx]
                - dist_matrix[before_idx * n + after_idx]
            )

        if delta < best_delta:
            best_delta = delta
            insert_pos_out[0] = pos

    return best_delta


def _best_rideshare_insert_delta(
    members: UnsafePointer[Int, MutAnyOrigin],
    count: Int,
    rider_idx: Int,
    n: Int,
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    insert_pos_out: UnsafePointer[Int, MutAnyOrigin],
) -> Float64:
    if count == 0:
        insert_pos_out[0] = 0
        return distance_to_dest[rider_idx]

    var best_delta = Float64(1e18)

    for pos in range(count + 1):
        var delta = Float64(0.0)
        if pos == 0:
            delta = dist_matrix[rider_idx * n + members[0]]
        elif pos == count:
            var before_idx = members[pos - 1]
            delta = (
                dist_matrix[before_idx * n + rider_idx]
                + distance_to_dest[rider_idx]
                - distance_to_dest[before_idx]
            )
        else:
            var before_idx = members[pos - 1]
            var after_idx = members[pos]
            delta = (
                dist_matrix[before_idx * n + rider_idx]
                + dist_matrix[rider_idx * n + after_idx]
                - dist_matrix[before_idx * n + after_idx]
            )

        if delta < best_delta:
            best_delta = delta
            insert_pos_out[0] = pos

    return best_delta


def _insert_member(
    members: UnsafePointer[Int, MutAnyOrigin],
    count: Int,
    insert_pos: Int,
    rider_idx: Int,
):
    var shift = count
    while shift > insert_pos:
        members[shift] = members[shift - 1]
        shift -= 1
    members[insert_pos] = rider_idx


def _optimize_group_orders(
    num_groups: Int,
    n: Int,
    group_is_rideshare: UnsafePointer[Bool, MutAnyOrigin],
    group_driver: UnsafePointer[Int, MutAnyOrigin],
    group_count: UnsafePointer[Int, MutAnyOrigin],
    group_members: UnsafePointer[Int, MutAnyOrigin],
    group_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    group_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
    distance_to_dest: UnsafePointer[Float64, MutAnyOrigin],
    dist_matrix: UnsafePointer[Float64, MutAnyOrigin],
    external_rideshare_cost_multiplier: Float64,
    external_rideshare_fixed_cost_seconds: Float64,
):
    var best_order = alloc[Int](MAX_K)
    for group_idx in range(num_groups):
        var members = group_members + group_idx * MAX_K
        if not group_is_rideshare[group_idx]:
            var drive_time = _best_pickup_order_unsafe(
                group_driver[group_idx],
                members,
                group_count[group_idx],
                n,
                distance_to_dest,
                dist_matrix,
                best_order,
            )
            for i in range(group_count[group_idx]):
                members[i] = best_order[i]
            group_drive_times[group_idx] = drive_time
            group_assignment_costs[group_idx] = drive_time
        else:
            var drive_time = _best_rideshare_order_unsafe(
                members,
                group_count[group_idx],
                n,
                distance_to_dest,
                dist_matrix,
                best_order,
            )
            for i in range(group_count[group_idx]):
                members[i] = best_order[i]
            group_drive_times[group_idx] = drive_time
            group_assignment_costs[group_idx] = (
                drive_time * external_rideshare_cost_multiplier
                + external_rideshare_fixed_cost_seconds
            )
    best_order.free()


def _pack_groups(
    num_groups: Int,
    group_is_rideshare: UnsafePointer[Bool, MutAnyOrigin],
    group_driver: UnsafePointer[Int, MutAnyOrigin],
    group_count: UnsafePointer[Int, MutAnyOrigin],
    group_members: UnsafePointer[Int, MutAnyOrigin],
    group_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    group_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
    result_slots: UnsafePointer[Int64, MutAnyOrigin],
    result_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    result_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
    result_cost_multipliers: UnsafePointer[Float64, MutAnyOrigin],
    external_rideshare_cost_multiplier: Float64,
):
    for group_idx in range(num_groups):
        var slot = result_slots + group_idx * INTS_PER_SLOT
        var members = group_members + group_idx * MAX_K
        var is_rideshare = group_is_rideshare[group_idx]
        var passenger_count = group_count[group_idx]
        var k = passenger_count + 1
        if is_rideshare:
            k = passenger_count

        slot[0] = 1
        slot[1] = Int64(k)
        if is_rideshare:
            slot[2] = -1
            slot[3] = 1
        else:
            slot[2] = Int64(group_driver[group_idx])
            slot[3] = 0

        if is_rideshare:
            for i in range(passenger_count):
                slot[4 + i] = Int64(members[i])
                slot[4 + MAX_K + i] = Int64(members[i])
            result_cost_multipliers[
                group_idx
            ] = external_rideshare_cost_multiplier
        else:
            slot[4] = Int64(group_driver[group_idx])
            for i in range(passenger_count):
                slot[4 + i + 1] = Int64(members[i])
                slot[4 + MAX_K + i] = Int64(members[i])
            result_cost_multipliers[group_idx] = 1.0

        result_drive_times[group_idx] = group_drive_times[group_idx]
        result_assignment_costs[group_idx] = group_assignment_costs[group_idx]


def _clear_result_buffers(
    max_groups: Int,
    result_slots: UnsafePointer[Int64, MutAnyOrigin],
    result_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    result_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
    result_cost_multipliers: UnsafePointer[Float64, MutAnyOrigin],
):
    for i in range(max_groups):
        result_drive_times[i] = 0.0
        result_assignment_costs[i] = 0.0
        result_cost_multipliers[i] = 1.0
        var slot = result_slots + i * INTS_PER_SLOT
        for j in range(INTS_PER_SLOT):
            slot[j] = 0


def _free_work_buffers(
    group_is_rideshare: UnsafePointer[Bool, MutAnyOrigin],
    group_driver: UnsafePointer[Int, MutAnyOrigin],
    group_count: UnsafePointer[Int, MutAnyOrigin],
    group_capacity: UnsafePointer[Int, MutAnyOrigin],
    group_members: UnsafePointer[Int, MutAnyOrigin],
    group_drive_times: UnsafePointer[Float64, MutAnyOrigin],
    group_assignment_costs: UnsafePointer[Float64, MutAnyOrigin],
    assigned: UnsafePointer[Bool, MutAnyOrigin],
):
    group_is_rideshare.free()
    group_driver.free()
    group_count.free()
    group_capacity.free()
    group_members.free()
    group_drive_times.free()
    group_assignment_costs.free()
    assigned.free()
