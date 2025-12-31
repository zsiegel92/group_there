import { createAuthClient } from "better-auth/react";

const getBaseURL = () => {
  // NEXT_PUBLIC_ variables are available in the browser environment
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!vercelUrl) {
    throw new Error("NEXT_PUBLIC_VERCEL_URL is not set");
  }
  if (vercelUrl.startsWith("http")) {
    return vercelUrl;
  }
  return `https://${vercelUrl}`;
};

const baseURL = getBaseURL();
console.log("baseURL", baseURL);

export const authClient = createAuthClient({
  baseURL,
});

export const { useSession, signIn, signOut } = authClient;
