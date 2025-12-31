import { createAuthClient } from "better-auth/react";

// NEXT_PUBLIC_ variables are available in the browser environment
if (!process.env.NEXT_PUBLIC_VERCEL_URL) {
  throw new Error("NEXT_PUBLIC_VERCEL_URL is not set");
}

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_VERCEL_URL,
});

export const { useSession, signIn, signOut } = authClient;
