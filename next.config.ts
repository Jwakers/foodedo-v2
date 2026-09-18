import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const requiredPublicEnvironment = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_SITE_URL",
];
const missingPublicEnvironment = requiredPublicEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);
if (missingPublicEnvironment.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingPublicEnvironment.join(", ")}`,
  );
}

const convexStoragePattern = new URL(
  "/api/storage/**",
  process.env.NEXT_PUBLIC_CONVEX_URL!,
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CAPACITOR_BUILD: String(isCapacitorBuild),
  },
  images: {
    remotePatterns: [convexStoragePattern],
    ...(isCapacitorBuild ? { unoptimized: true } : {}),
  },
  ...(isCapacitorBuild
    ? {
        // Capacitor production builds package compiled assets in the native app.
        // The regular web build remains server-capable for Vercel.
        output: "export",
      }
    : {}),
};

export default nextConfig;
