"use client";

import { useEffect, useRef } from "react";
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
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Wait for session to load
    if (isPending || hasRedirected.current) return;

    // Check if we should redirect to preview
    const shouldRedirect = shouldRedirectToPreview();

    if (shouldRedirect && session) {
      hasRedirected.current = true;

      // Get the preview redirect URL
      const previewUrl = getPreviewRedirectUrl();
      if (!previewUrl) {
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
      hasRedirected.current = true;
      // Not a preview redirect, go to home
      console.log("[OAuth] Redirecting to home");
      router.push("/");
    }
  }, [session, isPending, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 inline-block size-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="text-lg">Completing sign in...</p>
      </div>
    </div>
  );
}
