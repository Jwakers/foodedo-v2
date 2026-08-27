import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";
const requiredPublicEnvironment = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CONVEX_URL",
  ...(isCapacitorBuild ? ["NEXT_PUBLIC_CONVEX_SITE_URL"] : []),
];
const missingPublicEnvironment = requiredPublicEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingPublicEnvironment.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingPublicEnvironment.join(", ")}`,
  );
}

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
