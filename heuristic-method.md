# GROUPTHERE Mojo Heuristic Method

The heuristic solver is a fast, non-default solve path for shared-destination
events. It is meant to produce a good feasible itinerary quickly while the
regular exact path continues solving the MILP.

Implementation entrypoints:

- Mojo core: `src/solver/mojo_app/heuristic_solver.mojo`
- Python wrapper: `src/solver/groupthere_solver/mojo_group_generator.py`
- Python dispatch: `src/solver/groupthere_solver/solve.py`
- API route: `POST /solve/heuristic`
- UI racing flow: `src/app/events/[id]/solve-client.ts`

## Problem Shape

The shared-destination problem has:

- trippers with origin locations
- direct travel time from each origin to the event destination
- pairwise travel times between tripper origins
- driver eligibility
- non-driver seat capacity
- `must_drive` constraints
- optional external rideshare vehicles with a cost multiplier and fixed cost

The exact solver first enumerates all feasible groups, then solves a binary
assignment MILP over those groups. The heuristic skips both all-group
enumeration and MILP assignment. It directly constructs one feasible partition
of trippers into vehicle groups.

## High-Level Algorithm

The heuristic is a greedy cheapest-insertion constructor:

1. Start with required drivers.
2. Repeatedly choose the cheapest next action for one unassigned tripper.
3. Insert that tripper into an existing vehicle, create a new participant
   vehicle, or create a rideshare vehicle.
4. After everyone is assigned, re-optimize pickup order inside each selected
   vehicle.
5. Return the selected groups as a normal `Solution` with `optimal=false`.

The core loop considers all currently unassigned trippers on each iteration and
chooses the globally cheapest feasible action available at that moment.

## Initialization

Every `must_drive` tripper is assigned first as the driver of their own vehicle.

This does two useful things:

- It satisfies the strongest constraint immediately.
- It prevents later greedy insertions from accidentally assigning a required
  driver as someone else's passenger.

If a `must_drive` tripper cannot drive, the heuristic returns infeasible.

The initial cost of a required driver's vehicle is their direct drive time to
the destination.

## Candidate Actions

For each unassigned tripper, the heuristic evaluates these possible actions.

### Insert Into Existing Participant Vehicle

A non-`must_drive` tripper can be inserted into an existing participant vehicle
if the vehicle has remaining non-driver seats.

The insertion cost is the marginal increase in route drive time at the best
insertion position.

For a route:

```text
driver -> p1 -> p2 -> ... -> destination
```

the algorithm tests every insertion slot. For example, inserting rider `r`
between `p1` and `p2` has marginal cost:

```text
time(p1, r) + time(r, p2) - time(p1, p2)
```

Inserting at the end has marginal cost:

```text
time(last_stop, r) + time(r, destination) - time(last_stop, destination)
```

Participant-vehicle assignment cost is the same as drive time, so the marginal
assignment cost equals the marginal drive time.

### Insert Into Existing Rideshare

If rideshares are enabled, a non-`must_drive` tripper can be inserted into an
existing rideshare group with remaining seats.

The route insertion calculation is the same idea as participant vehicles, but
there is no participant driver. The first passenger is treated as the first
route stop.

The marginal assignment cost is:

```text
marginal_drive_time * external_rideshare_cost_multiplier
```

The fixed rideshare cost is paid only when a new rideshare vehicle is created,
not when adding more riders to that same rideshare.

### Start New Participant Vehicle

If the unassigned tripper can drive, the heuristic may create a new participant
vehicle with that tripper as the driver.

The cost is their direct drive time to the destination.

### Start New External Rideshare

If external rideshares are enabled and the tripper is not `must_drive`, the
heuristic may create a new rideshare vehicle containing that tripper.

The assignment cost is:

```text
direct_drive_time * external_rideshare_cost_multiplier
  + external_rideshare_fixed_cost_seconds
```

The drive time stored on the solution remains the actual route drive time, not
the multiplied assignment cost.

## Greedy Selection

After all candidate actions are evaluated, the solver commits the single action
with the lowest current incremental assignment cost.

That means the heuristic optimizes locally, not globally. It can make choices
that look cheapest now but prevent a better later grouping. This is the main
quality tradeoff compared with the exact MILP path.

The upside is that it avoids enumerating every possible feasible group. With
small vehicle capacities, the exact group enumerator is manageable, but it still
grows combinatorially. The heuristic loop is closer to:

```text
O(number_of_trippers^2 * number_of_groups * max_vehicle_size)
```

with a small constant from the vehicle size cap.

## Final Route-Order Optimization

The greedy insertion order is not trusted as final.

Once every tripper has been assigned to a vehicle, each selected group is passed
through the existing exact within-group pickup-order search:

- participant vehicle groups use `_best_pickup_order_unsafe`
- rideshare groups use `_best_rideshare_order_unsafe`

These functions try the possible pickup orders within a selected group and keep
the best route. Because GROUPTHERE caps non-driver seats at a small number, this
factorial search is cheap inside a single vehicle.

This final step cannot move riders between vehicles. It only improves the route
order inside each vehicle that the greedy constructor already chose.

## Feasibility Rules

The heuristic enforces the same core shared-destination feasibility rules as the
exact solver:

- every tripper is assigned exactly once
- `must_drive` trippers drive and are never passengers
- participant vehicles respect non-driver seat capacity
- external rideshares are used only when enabled
- `must_drive` trippers are never assigned to rideshares

If the loop cannot find any feasible action for an unassigned tripper, the
heuristic returns an infeasible solution.

## Output Semantics

The heuristic returns the same `Solution` model as the regular solver.

Important differences:

- `id` is prefixed with `heuristic-solution-`
- `optimal` is always `false` for non-empty feasible heuristic solutions
- `status_message` says the solution was produced by the Mojo heuristic
- `total_drive_seconds` is actual drive time, not rideshare-weighted assignment
  cost

This keeps the UI rendering path shared with exact solutions while still making
it clear that the first answer is provisional.

## UI Usage

The heuristic is not the default solver.

When the app requests a shared-destination solve, the client starts two server
actions:

- `POST /solve/heuristic`
- `POST /solve`

If the heuristic returns first, the UI renders it immediately. If the exact
solution returns later, it replaces the heuristic result. If the exact solution
returns first, the heuristic result is ignored.

Commute solves currently use only the exact path. The heuristic solver
entrypoint raises `NotImplementedError` for commute problems, and the HTTP
endpoint returns `501`, because there is not yet a commute-specific heuristic.

## Benchmarking

The benchmark lives in:

```text
src/solver/groupthere_solver/heuristic_benchmark.py
```

Run it with:

```sh
pnpm run pr python-heuristic-benchmark
```

The benchmark procedurally generates shared-destination problems with:

- 8-14 trippers
- random planar origin points
- direct-to-destination and pairwise travel times derived from Euclidean
  distance
- random seat counts
- occasional `must_drive` constraints

For each generated case it compares:

- heuristic total drive seconds
- regular solver total drive seconds using CBC with `mip_gap=0.10`

The ratio is:

```text
heuristic_total_drive_seconds / cbc_total_drive_seconds
```

The most recent local benchmark result is recorded in
`src/solver/HEURISTIC_BENCHMARK_RESULTS.md`:

```json
{
  "cases": 30,
  "average_ratio": 1.214,
  "worst_ratio": 1.4307,
  "p90_ratio": 1.3907,
  "exact_mip_gap": 0.1
}
```

Because the comparison solver is allowed a 10% MIP gap, these ratios are a
practical quality signal rather than a mathematical proof against true
optimality.

## Known Limits

The current heuristic does not perform local search after construction. In
particular, it does not yet try:

- moving one rider from one vehicle to another
- swapping riders between vehicles
- merging or splitting vehicle groups
- replacing participant vehicles with rideshares after construction

Those would be natural next improvements if the provisional solution quality
needs to improve while still staying much faster than the full MILP path.
