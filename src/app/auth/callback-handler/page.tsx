"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/auth-client";
import {
  clearSavedPreviewUrl,
  getPreviewRedirectUrl,
  shouldRedirectToPreview,
} from "@/lib/preview-redirect";

/**
 * This page is used as the OAuth callback URL.
 * After OAuth completes on production, it checks if the user came from a preview
 * deployment and redirects them back with their session.
 */
export default function CallbackHandlerPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState<"checking" | "redirecting" | "error">(
    "checking"
  );

  useEffect(() => {
    // Wait for session to load
    if (isPending) return;

    // Check if we should redirect to preview
    const shouldRedirect = shouldRedirectToPreview();

    if (shouldRedirect && session) {
      setStatus("redirecting");

      // Get the preview redirect URL
      const previewUrl = getPreviewRedirectUrl();
      if (!previewUrl) {
        setStatus("error");
        console.error("[Preview OAuth] No preview URL found");
        return;
      }

      // Get session token from cookie to pass to preview
      const cookies = document.cookie.split(";");
      const sessionCookie = cookies.find((c) =>
        c.trim().startsWith("better-auth.session_token=")
      );

      if (!sessionCookie) {
        console.warn("[Preview OAuth] No session cookie found");
        // Continue anyway, preview might be able to create session
      }

      const sessionToken = sessionCookie
        ? sessionCookie.split("=")[1]
        : undefined;

      // Build redirect URL with session token
      const redirectUrl = new URL(previewUrl);
      if (sessionToken) {
        redirectUrl.searchParams.set("session_token", sessionToken);
      }

      console.log("[Preview OAuth] Redirecting to preview:", redirectUrl.href);

      // Clear the saved preview URL
      clearSavedPreviewUrl();

      // Redirect to preview deployment
      window.location.href = redirectUrl.href;
    } else if (session) {
      // Not a preview redirect, go to home
      console.log("[OAuth] Redirecting to home");
      router.push("/");
    } else {
      // No session, something went wrong
      setStatus("error");
      console.error("[OAuth] No session found after OAuth callback");
    }
  }, [session, isPending, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        {status === "checking" && (
          <>
            <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="text-lg">Completing sign in...</p>
          </>
        )}
        {status === "redirecting" && (
          <>
            <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="text-lg">Redirecting to preview deployment...</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mb-4 text-lg text-red-600">
              Authentication error occurred
            </p>
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
