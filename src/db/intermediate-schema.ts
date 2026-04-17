/*
 * Transitional schema for the staged trip-model migration.
 *
 * The current refactor is intentionally additive: existing tables remain in
 * place, new required columns have safe defaults, and data-copy steps are
 * manual SQL backfills documented in db_migration_plan.md. Keeping this file as
 * a separate Drizzle target lets the migration be applied, inspected, backfilled,
 * and then finalized before this file is deleted.
 */

export * from "./schema";
