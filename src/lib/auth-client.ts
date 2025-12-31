import { createAuthClient } from "better-auth/react";

const getBaseURL = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!vercelUrl) {
    throw new Error(
      "NEXT_PUBLIC_VERCEL_URL is not set and window not defined!"
    );
  }
  if (vercelUrl.startsWith("http")) {
    return vercelUrl;
  }
  return `https://${vercelUrl}`;
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

export const { useSession, signIn, signOut } = authClient;
