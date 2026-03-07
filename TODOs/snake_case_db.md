Update the table/column names in `src/db/schema.ts` so that the typescript variables are still camelCase but the db column/table names are ALL snake_case.

Look at the `sqlc` command in `package.json` and use that (or something similar) to migrate the data in the db - we do NOT want data loss or truncation, just do the commands that need to be done to make it happen.

When you're done, `pnpm run db:migrate` shouldn't show any necessary migrations.
