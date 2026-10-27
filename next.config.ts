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
  // Only the web build discovers editorial entrypoints and its live sitemap.
  pageExtensions: [
    ...(isCapacitorBuild ? ["native.tsx", "native.ts"] : ["web.tsx", "web.ts"]),
    "tsx",
    "ts",
    "jsx",
    "js",
  ],
  env: {
    NEXT_PUBLIC_CAPACITOR_BUILD: String(isCapacitorBuild),
  },
  ...(!isCapacitorBuild
    ? {
        async redirects() {
          return [
            { source: "/pricing", destination: "/faq", permanent: false },
            { source: "/beta", destination: "/", permanent: true },
            {
              source: "/discover/recipe/chicken-tacos-with-salsa",
              destination: "/recipes/chicken-tacos-with-avocado-salsa",
              permanent: true,
            },
            {
              source: "/recipes/chicken-tacos-with-salsa",
              destination: "/recipes/chicken-tacos-with-avocado-salsa",
              permanent: true,
            },
            { source: "/discover", destination: "/recipes", permanent: true },
            {
              source: "/recipes/page/1",
              destination: "/recipes",
              permanent: true,
            },
            {
              source: "/recipes/page/:pageNumber",
              destination: "/recipes?page=:pageNumber",
              permanent: true,
            },
            {
              source: "/discover/recipe/:slug",
              destination: "/recipes/:slug",
              permanent: true,
            },
          ];
        },
        async headers() {
          return [
            {
              source: "/.well-known/apple-app-site-association",
              headers: [{ key: "Content-Type", value: "application/json" }],
            },
          ];
        },
      }
    : {}),
  images: {
    remotePatterns: [
      convexStoragePattern,
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: `/images/${process.env.SANITY_PROJECT_ID?.trim() || "i8ook8b1"}/${process.env.SANITY_DATASET?.trim() || "production"}/**`,
      },
    ],
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
