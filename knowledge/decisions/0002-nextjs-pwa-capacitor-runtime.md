# 0002 — Next.js PWA + Capacitor iOS runtime

## Status

Accepted

## Context

V2 needs a web app, an installable PWA, and an iOS wrapper. Capacitor production apps are expected to package compiled assets from `webDir`; its `server.url` option is explicitly intended for development live reload, not production. Next.js App Router supports a static export while still allowing the normal web deployment to use its server runtime.

## Decision

- **Web/PWA** deploys to Vercel using the normal server-capable Next.js build (Next.js 16 App Router, Tailwind v4, Serwist).
- **Capacitor 8, iOS only** packages `out/`, produced by a dedicated Next.js static-export build (`CAPACITOR_BUILD=true`). `webDir` is `out`.
- `server.url` is never part of a production configuration. Capacitor's `cap run ios --live-reload` CLI may temporarily point a development build at the Next dev server on the LAN.
- **No Android.**
- Bundle ID: `com.foodedo.app` (product identity, not `app.foodedo.v2`).

Native plugins (camera, photos, share, haptics, push, deep links) are documented, not implemented in the foundation.

## Consequences

- The native shell and route assets work without a web origin; live data still depends on the future backend and its resilience strategy.
- Shared native routes must remain compatible with static export. Dynamic data uses client-side Convex or explicit external APIs; unsupported Next server features require a deliberate web/native split.
- Capacitor `sync` rebuilds and copies native web assets; it does not replace Vercel deploys.
- Confirm bundle ID against any existing App Store app before shipping native.
