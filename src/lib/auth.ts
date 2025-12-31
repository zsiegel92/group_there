import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db/db";
import * as schema from "@/db/schema";

const getBaseURL = () => {
  // For local development, use localhost
  if (
    !process.env.VERCEL_ENV &&
    process.env.VERCEL_URL?.includes("localhost")
  ) {
    return process.env.VERCEL_URL.startsWith("http")
      ? process.env.VERCEL_URL
      : `http://${process.env.VERCEL_URL}`;
  }

  // For all Vercel deployments (production and preview), use production URL
  // This allows OAuth callbacks to work with a single GitHub OAuth app configuration
  if (process.env.PRODUCTION_URL) {
    return process.env.PRODUCTION_URL;
  }

  // Fallback to VERCEL_URL if PRODUCTION_URL is not set (shouldn't happen in production)
  const vercelUrl = process.env.VERCEL_URL;
  if (!vercelUrl) {
    throw new Error("Neither PRODUCTION_URL nor VERCEL_URL is set");
  }
  if (vercelUrl.startsWith("http")) {
    return vercelUrl;
  }
  return `https://${vercelUrl}`;
};

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
  baseURL: getBaseURL(),
  trustedOrigins: [
    "http://localhost:3000",
    "https://grouptherenow.com",
    "https://www.grouptherenow.com",
    ...(process.env.VERCEL_URL
      ? [`https://${process.env.VERCEL_URL}`, process.env.VERCEL_URL]
      : []),
  ],
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
