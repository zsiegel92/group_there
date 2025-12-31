/**
 * Preview deployment OAuth redirect utilities
 *
 * Handles OAuth callbacks for preview deployments by:
 * 1. Detecting if we're on a preview deployment
 * 2. Saving the preview URL to localStorage before OAuth
 * 3. Redirecting from production callback back to preview with auth
 */

const PREVIEW_URL_KEY = "oauth_preview_url";
const PRODUCTION_DOMAIN = "grouptherenow.com";

/**
 * Check if the current hostname is a preview deployment
 */
export function isPreviewDeployment(): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;

  // Not a preview if it's production
  if (hostname.includes(PRODUCTION_DOMAIN)) return false;

  // Not a preview if it's localhost
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;

  // Is a preview if it's a vercel deployment
  return hostname.includes("vercel.app");
}

/**
 * Save the current preview URL to localStorage before OAuth
 */
export function savePreviewUrlForOAuth(): void {
  if (!isPreviewDeployment()) return;

  const currentUrl = window.location.origin;
  localStorage.setItem(PREVIEW_URL_KEY, currentUrl);
  console.log("[Preview OAuth] Saved preview URL:", currentUrl);
}

/**
 * Get the saved preview URL from localStorage
 */
export function getSavedPreviewUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PREVIEW_URL_KEY);
}

/**
 * Clear the saved preview URL from localStorage
 */
export function clearSavedPreviewUrl(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREVIEW_URL_KEY);
}

/**
 * Check if we should redirect to a preview URL after OAuth callback
 * This should be called on the production callback page
 */
export function shouldRedirectToPreview(): boolean {
  return getSavedPreviewUrl() !== null;
}

/**
 * Get the redirect URL for completing OAuth on a preview deployment
 * @param callbackPath - The path to redirect to (default: /auth/callback-redirect)
 */
export function getPreviewRedirectUrl(
  callbackPath = "/auth/callback-redirect"
): string | null {
  const previewUrl = getSavedPreviewUrl();
  if (!previewUrl) return null;

  return `${previewUrl}${callbackPath}`;
}
