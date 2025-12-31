import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      users: schema.users,
      accounts: schema.accounts,
      verifications: schema.verifications,
      sessions: schema.sessions,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: ["http://localhost:3000"],
  socialProviders: {
    github: {
      clientId: process.env.BETTER_AUTH_GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET ?? "",
    },
  },
  session: {
    // storeSessionInDatabase: false, // does not work with drizzle adapter!
    cookieCache: {
      enabled: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      strategy: "jwe", // encrypted cookies
      refreshCache: true, // auto-refresh at 80% of maxAge
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;

export async function getUser(): Promise<User | null> {
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}
