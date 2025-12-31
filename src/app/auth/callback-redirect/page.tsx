"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * This page is used on preview deployments to complete the OAuth flow.
 * After production redirects here with a session token, we set it as a cookie
 * and verify the session works.
 */
export default function CallbackRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<
    "processing" | "verifying" | "success" | "error"
  >("processing");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const processRedirect = async () => {
      // Get session token from URL
      const sessionToken = searchParams.get("session_token");

      if (!sessionToken) {
        setError("No session token provided");
        setStatus("error");
        return;
      }

      try {
        // Set the session token as a cookie
        // Better-auth uses "better-auth.session_token" as the cookie name
        document.cookie = `better-auth.session_token=${sessionToken}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;

        console.log("[Preview OAuth] Session token set as cookie");

        // Verify the session works by fetching session info
        setStatus("verifying");

        const response = await fetch("/api/auth/get-session", {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Session verification failed: ${response.status}`);
        }

        const sessionData = await response.json();
        console.log("[Preview OAuth] Session verified:", sessionData);

        // Success! Redirect to home
        setStatus("success");
        setTimeout(() => {
          router.push("/");
        }, 1000);
      } catch (err) {
        console.error("[Preview OAuth] Error:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };

    processRedirect();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === "processing" && (
          <>
            <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="text-lg">Processing authentication...</p>
          </>
        )}
        {status === "verifying" && (
          <>
            <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="text-lg">Verifying session...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="mb-4 text-6xl">✓</div>
            <p className="text-lg text-green-600">
              Authentication successful! Redirecting...
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mb-4 text-lg text-red-600">Authentication failed</p>
            <p className="mb-4 text-sm text-gray-600">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            >
              Return to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
