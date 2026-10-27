// Standard route filename avoids Next.js custom-extension manifest tracing bugs.
// Plain .js entrypoints are excluded from the Capacitor build in next.config.ts.
export { GET, POST } from "@/lib/analytics-proxy.server";
