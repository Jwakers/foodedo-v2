import type { ClerkProviderProps } from "@clerk/react";
import { Capacitor, registerPlugin } from "@capacitor/core";

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
 * Keeps Clerk's browser session in the WebView while presenting social auth
 * with iOS's ASWebAuthenticationSession. This internal Clerk API is isolated
 * here so an SDK change has one replacement point.
 */
export const capacitorClerkOAuthTransport: OAuthTransport = {
  getRedirectUrl: () => {
    // Browser-mode Clerk accepts HTTP(S), not the app scheme. This bridge
    // forwards Clerk's rotating callback parameters to the native session.
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
