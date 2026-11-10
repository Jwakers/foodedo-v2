import { Clerk } from "@clerk/clerk-js";
import type { ClerkProviderProps } from "@clerk/react";
import { loadClerkUIScript } from "@clerk/shared/loadClerkJsScript";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { nativeClerkRequestHooks } from "./clerk-native-requests";
import { capacitorClerkOAuthTransport } from "./clerk-oauth-transport";

interface NativeClientTokenPlugin {
  getClientToken(options: {
    frontendApiHost: string;
  }): Promise<{ token?: string }>;
  setClientToken(options: {
    frontendApiHost: string;
    token: string;
  }): Promise<void>;
}
const native = registerPlugin<NativeClientTokenPlugin>("ClerkOAuth");
type NativeOptions = Pick<
  ClerkProviderProps,
  | "Clerk"
  | "ui"
  | "standardBrowser"
  | "__internal_oauthTransport"
  | "allowedRedirectProtocols"
>;
let cached:
  { publishableKey: string; promise: Promise<NativeOptions> } | undefined;

export function nativeClerkOptions(
  publishableKey: string,
): Promise<NativeOptions> {
  if (cached?.publishableKey === publishableKey) return cached.promise;
  const promise = createOptions(publishableKey).catch((error: unknown) => {
    if (cached?.promise === promise) cached = undefined;
    throw error;
  });
  cached = { publishableKey, promise };
  return promise;
}

async function createOptions(publishableKey: string): Promise<NativeOptions> {
  if (!Capacitor.isPluginAvailable("ClerkOAuth")) {
    throw new Error(
      "Native authentication is unavailable. Rebuild the iOS app.",
    );
  }
  const clerk = new Clerk(publishableKey);
  const frontendApiHost = clerk.frontendApi;
  const store = {
    async get() {
      const result = await native.getClientToken({ frontendApiHost });
      return result.token ?? null;
    },
    async set(token: string) {
      await native.setClientToken({ frontendApiHost, token });
    },
  };
  // Fail before mounting the provider if the device cannot access its Keychain.
  await store.get();
  const hooks = nativeClerkRequestHooks(frontendApiHost, store);
  clerk.__internal_onBeforeRequest(hooks.before);
  clerk.__internal_onAfterResponse(hooks.after);
  // The loader otherwise selects the latest major-1 UI from the CDN, outside
  // our lockfile. Keep this aligned with the tested ClerkJS/shared version set.
  await loadClerkUIScript({
    publishableKey,
    __internal_clerkUIVersion: "1.42.4",
  });
  const ClerkUI = window.__internal_ClerkUICtor;
  if (!ClerkUI)
    throw new Error("Foodedo could not load the sign-in interface.");
  return {
    Clerk: clerk,
    ui: { ClerkUI },
    standardBrowser: false,
    allowedRedirectProtocols: ["capacitor:"],
    __internal_oauthTransport: capacitorClerkOAuthTransport,
  };
}
