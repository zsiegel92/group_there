import { createAuthClient } from "better-auth/react";

/**
 * Get the base URL for auth client
 * - For localhost: use localhost
 * - For all other environments: use production URL
 * This ensures OAuth flows always go through production
 */
function getAuthBaseURL(): string | undefined {
  if (typeof window === "undefined") return undefined;

  const hostname = window.location.hostname;

  // Use local URL for development
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined; // Let better-auth auto-detect
  }

  // Use production URL for all other environments (including preview deployments)
  return "https://www.grouptherenow.com";
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
});

export const { useSession, signIn, signOut } = authClient;
