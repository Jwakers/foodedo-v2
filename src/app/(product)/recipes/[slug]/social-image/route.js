// Standard route filename avoids Next.js custom-extension manifest tracing bugs.
// Plain .js entrypoints are excluded from the Capacitor build in next.config.ts.
export { GET } from "@/features/public-recipes/social-image.server";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 86400;
