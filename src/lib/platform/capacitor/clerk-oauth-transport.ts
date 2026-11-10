import type { ClerkProviderProps } from "@clerk/react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { oauthCallbackFailureCode } from "@/lib/domain/oauth-callback";

const clerkOAuthCallbackUrl = "com.foodedo.app://callback";
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

type OAuthTransport = NonNullable<
  ClerkProviderProps["__internal_oauthTransport"]
>;

type ClerkOAuthPlugin = {
  authenticate(options: { url: string }): Promise<{ callbackUrl: string }>;
};

const clerkOAuthPlugin = registerPlugin<ClerkOAuthPlugin>("ClerkOAuth");

/**
 * Presents social auth with ASWebAuthenticationSession. The native client JWT
 * adapter handles identity independently of browser cookies.
 */
export const capacitorClerkOAuthTransport: OAuthTransport = {
  getRedirectUrl: () => {
    // Keep the already-allowlisted HTTPS bridge; it forwards the native nonce
    // to ASWebAuthenticationSession's registered app-scheme callback.
    return new URL("/clerk-oauth-callback", convexSiteUrl).toString();
  },
  open: async (verificationUrl) => {
    if (!Capacitor.isPluginAvailable("ClerkOAuth")) {
      throw new Error(
        "The native Clerk OAuth plugin is unavailable. Rebuild the iOS app in Xcode.",
      );
    }

    const result = await clerkOAuthPlugin.authenticate({
      url: verificationUrl.toString(),
    });

    if (!isClerkOAuthCallback(result.callbackUrl)) {
      throw new Error("Social sign-in returned an unexpected callback URL.");
    }

    // Clerk's transport collapses most provider failures to oauth_callback_failed.
    // Keep its existing error/recovery handling, but expose the non-sensitive code
    // for diagnosis. Never log the callback itself: it can contain session nonces.
    const failureCode = oauthCallbackFailureCode(result.callbackUrl);
    if (failureCode) {
      console.warn("[Foodedo OAuth] Callback failed:", failureCode);
    }

    return result;
  },
};

function isClerkOAuthCallback(value: string) {
  try {
    const callback = new URL(value);
    const expected = new URL(clerkOAuthCallbackUrl);

    return (
      callback.protocol === expected.protocol &&
      callback.host === expected.host &&
      callback.pathname === expected.pathname
    );
  } catch {
    return false;
  }
}
