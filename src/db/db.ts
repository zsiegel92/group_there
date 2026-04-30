import type { Pool } from "pg";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

declare global {
  var grouptherePgPool: Pool | undefined;
}

const databaseUrl = process.env.DATABASE_URL;

const createDb = async () => {
  if (databaseUrl.includes("neondb")) {
    const { drizzle } = await import("drizzle-orm/neon-http");

    return drizzle(databaseUrl, { schema });
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  globalThis.grouptherePgPool ??= new Pool({
    connectionString: databaseUrl,
  });

  return drizzle(globalThis.grouptherePgPool, { schema });
};

export const db = await createDb();
