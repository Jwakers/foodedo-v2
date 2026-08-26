# 0008 — Convex and Clerk

## Status

Accepted

## Context

Foodedo needs durable personal data, secure ownership, and one identity that works across the Vercel web app and the Capacitor iOS static bundle. The user has selected Convex and Clerk. V2 must remain isolated from the live V1 backend and must not create anonymous backend users for guests.

Next.js Proxy, request cookies, and server-only authentication helpers cannot run in the Capacitor static export. Authorization therefore cannot depend on a Next.js request boundary shared by both delivery modes.

## Decision

- Use a brand-new V2 Convex project, separate deployments, and no V1 keys.
- Use Clerk as the V2 identity provider and activate Clerk's Convex integration (`applicationID: "convex"`).
- Use Clerk's framework-neutral React SDK with `ConvexProviderWithClerk` in shared routes so the same code can run in the browser and Capacitor WebView without importing Next.js server actions.
- Run the shared Clerk web SDK in standard-browser mode in both web delivery and Capacitor's cookie-capable `WKWebView`, with `capacitor://localhost` in the Clerk instance `allowed_origins`. Do not use `standardBrowser=false` without a native token/request adapter.
- For Capacitor social/SSO only, inject an isolated OAuth transport backed by a narrow local Capacitor plugin around Apple's `ASWebAuthenticationSession`. Give Clerk an HTTPS callback on the Convex site because its standard-browser completion endpoint requires HTTP(S); the bridge forwards the result to `com.foodedo.app://callback`, which the authentication session captures before dismissing automatically. Keep email auth and the Clerk/Convex session in the shared web client.
- Do not add Next.js Proxy solely for auth. Every personal Convex function validates the Clerk JWT through `ctx.auth` and derives ownership server-side.
- Synchronize only required Clerk profile fields into the Convex `users` table through a signed Convex HTTP action handling `user.created`, `user.updated`, and `user.deleted`.
- Keep the webhook signing secret and Clerk Frontend API URL in Convex deployment environment variables. Keep the Clerk publishable key and Convex client URL in build/runtime environment variables.
- Begin the cross-platform proof with email/passwordless authentication, then prove Google through the registered iOS callback before enabling further providers.
- Continue to keep guest drafts local. Clerk identity is requested only at the persistence boundary.

## Consequences

- Web and iOS share one web-client authentication integration while Convex remains the security boundary. Capacitor's `WKWebView` persists the browser session for this proof; a future native Clerk client would have a distinct token-storage contract.
- Webhook sync is eventually consistent; the UI must distinguish JWT authentication from the user document arriving.
- The iOS static export remains valid because it contains no Proxy, server action, request-dependent route, or Next.js request-cookie auth handling. Authentication still relies on the shared Clerk session and WKWebView cookie persistence.
- Social/SSO requires Clerk native-application configuration, the exact HTTPS Convex bridge in the mobile callback allowlist, the registered app scheme, and device testing before release. The current Clerk OAuth transport option is internal, so Clerk upgrades must re-verify this isolated adapter. A generic in-app browser is deliberately not used for OAuth because it cannot securely capture and complete the callback as an authentication session.
- Production needs separate Clerk/Convex environment configuration and its own webhook endpoint.
