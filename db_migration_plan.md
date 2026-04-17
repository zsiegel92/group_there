# Trip Model Migration Plan

This plan stages the schema changes for commutes, recurring event series, and future external rideshare support. Do not run these steps until you are ready to update the database. This repo change adds the schema files only; it does not apply them.

## Files Added For The Staged Push

- `drizzle-intermediate.config.ts` points Drizzle at `src/db/intermediate-schema.ts`.
- `src/db/intermediate-schema.ts` currently re-exports the app schema because this refactor is additive: existing tables stay in place, new required columns have defaults, and manual SQL is used to backfill semantic defaults before the final push.
- After the final verification step, delete both files if you do not want to keep a staged migration target around.

## Stage 0: Preflight

1. Confirm the app is not actively writing event/attendance rows during the migration window.
2. Take a database backup or Neon branch before starting.
3. Confirm Drizzle can connect:

```sh
pnpm exec drizzle-kit check --config drizzle.config.ts
```

## Stage 1: Apply The Intermediate Schema

Run the intermediate push. This should add the new tables/columns/indexes without removing existing tables or data.

```sh
pnpm exec drizzle-kit push --config drizzle-intermediate.config.ts
```

## Stage 2: Manual Backfill

Open a DB shell:

```sh
pnpm run dbshell
```

Then run this SQL. It is written to be safe to re-run.

```sql
BEGIN;

UPDATE events
SET
  kind = COALESCE(kind, 'shared_destination'),
  time_zone = COALESCE(time_zone, 'America/New_York'),
  participation_mode = COALESCE(participation_mode, 'opt_in'),
  external_rideshare_mode = COALESCE(external_rideshare_mode, 'disabled'),
  external_rideshare_seats = COALESCE(external_rideshare_seats, 3),
  external_rideshare_cost_multiplier = COALESCE(external_rideshare_cost_multiplier, 3),
  external_rideshare_fixed_cost_seconds = COALESCE(external_rideshare_fixed_cost_seconds, 0);

UPDATE events_to_users AS etu
SET
  destination_location_id = COALESCE(etu.destination_location_id, e.location_id),
  required_arrival_time = COALESCE(etu.required_arrival_time, e.time)
FROM events AS e
WHERE etu.event_id = e.id;

UPDATE solutions
SET
  problem_kind = COALESCE(problem_kind, 'shared_destination'),
  external_rideshare_mode = COALESCE(external_rideshare_mode, 'disabled'),
  external_rideshare_vehicle_count = COALESCE(external_rideshare_vehicle_count, 0),
  total_external_rideshare_cost_seconds = COALESCE(total_external_rideshare_cost_seconds, 0);

UPDATE solution_parties
SET
  vehicle_kind = COALESCE(vehicle_kind, 'participant_vehicle'),
  cost_multiplier = COALESCE(cost_multiplier, 1);

COMMIT;
```

## Stage 3: Validate Backfill

Run these checks before deploying app code that depends on the new columns.

```sql
SELECT COUNT(*) AS missing_event_defaults
FROM events
WHERE kind IS NULL
  OR time_zone IS NULL
  OR participation_mode IS NULL
  OR external_rideshare_mode IS NULL
  OR external_rideshare_seats IS NULL
  OR external_rideshare_cost_multiplier IS NULL
  OR external_rideshare_fixed_cost_seconds IS NULL;

SELECT COUNT(*) AS missing_solution_defaults
FROM solutions
WHERE problem_kind IS NULL
  OR external_rideshare_mode IS NULL
  OR external_rideshare_vehicle_count IS NULL
  OR total_external_rideshare_cost_seconds IS NULL;

SELECT COUNT(*) AS missing_party_defaults
FROM solution_parties
WHERE vehicle_kind IS NULL
  OR cost_multiplier IS NULL;
```

Each count should be `0`. `events_to_users.destination_location_id` and `events_to_users.required_arrival_time` may remain `NULL` only for legacy rows whose event has no shared destination.

`events_to_users` continues to mean "this user is attending this event occurrence." For recurring opt-out flows, create rows for joined series members when generating/scheduling an occurrence; deleting a row is the per-occurrence opt-out. `event_series_to_users.participation_status` controls whether future occurrence rows should be generated.

## Stage 4: Apply The Final App Schema

Run the normal schema push. With the current additive refactor this should be a no-op or only tighten metadata Drizzle did not apply in Stage 1.

```sh
pnpm exec drizzle-kit push --config drizzle.config.ts
```

## Stage 5: Deploy And Clean Up

1. Deploy the app code after Stage 4 passes.
2. Smoke-test creating an event, joining it, generating distances, solving, confirming, and unlocking.
3. Delete `drizzle-intermediate.config.ts` and `src/db/intermediate-schema.ts` once the migration is complete and committed/deployed.

## Future Rename Notes

This migration deliberately does not rename `events`, `events_to_users`, or solution tables. If you later decide to rename tables to more generic names such as `trip_occurrences` or `trip_participants`, use this same pattern:

1. Create an intermediate schema with both old and new tables.
2. Push the intermediate schema.
3. Copy data with explicit `INSERT INTO new_table (...) SELECT ... FROM old_table`.
4. Deploy code that reads/writes the new table.
5. Drop old tables in a later migration after verification.
