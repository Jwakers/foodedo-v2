import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = isCapacitorBuild
  ? {
      // Capacitor production builds package compiled assets in the native app.
      // The regular web/PWA build remains server-capable for Vercel.
      output: "export",
      images: { unoptimized: true },
    }
  : {};

export default withSerwist(nextConfig);
