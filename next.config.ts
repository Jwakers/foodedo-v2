import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CAPACITOR_BUILD: String(isCapacitorBuild),
  },
  ...(isCapacitorBuild
    ? {
        // Capacitor production builds package compiled assets in the native app.
        // The regular web build remains server-capable for Vercel.
        output: "export",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
