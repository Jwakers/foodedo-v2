import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Production iOS builds package the Next.js static export from `out/`.
 * Do not set `server.url` here: Capacitor reserves it for development live
 * reload. Use `cap run ios --live-reload` when a remote dev server is needed.
 *
 * Bundle ID: com.foodedo.app — reverse-DNS for the consumer product.
 * V2 is a rewrite of Foodedo, not a side-by-side “v2” app, so the ID is
 * not namespaced as app.foodedo.v2. Confirm against any existing App Store
 * listing before first native release.
 */
const config: CapacitorConfig = {
  appId: "com.foodedo.app",
  appName: "Foodedo",
  webDir: "out",
};

export default config;
