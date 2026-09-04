# 0002 — Next.js web + Capacitor iOS runtime

## Status

Accepted

## Context

V2 needs a browser-accessible web app and an App Store iOS app. Capacitor production apps package compiled assets from `webDir`; its `server.url` option is for development live reload, not production. A service-worker PWA would add a third delivery promise—cache lifecycle, offline behavior, and install UX—without being required by Capacitor or a proven early user job.

Next.js App Router supports both a normal Vercel build and a dedicated static export. Next.js 16 uses Turbopack by default for development and production builds.

## Decision

- **Web** deploys to Vercel using the normal server-capable Next.js build.
- Keep the web manifest, icons, and Apple metadata as lightweight Add to Home Screen support. Do not position this as a separate PWA product channel.
- Do not ship a service worker, offline cache, web push, or background-sync system until a concrete job requires one.
- **Capacitor 8, iOS only** packages `out/`, produced by a dedicated Next.js static-export build (`CAPACITOR_BUILD=true`). `webDir` is `out`.
- `server.url` is never part of production configuration. Capacitor's `cap run ios --live-reload` CLI may temporarily point a development build at the Next dev server on the LAN.
- Use Next.js 16's default Turbopack path for `next dev` and both `next build` scripts.
- **No Android.**
- Bundle ID: `com.foodedo.app`.

Native plugins (camera, photos, share, haptics, push, deep links) are documented, not implemented in the foundation.

## Consequences

- Foodedo supports two deliberate channels: web and App Store iOS. Add to Home Screen is a progressive enhancement, not a separately marketed app.
- The browser version requires connectivity beyond ordinary browser caching; do not claim offline-web support.
- The native shell and route assets work without the web origin; live data still depends on the future backend and its resilience strategy.
- Shared native routes must remain compatible with static export. Dynamic data uses client-side Convex or explicit external APIs; unsupported Next server features require a deliberate web/native split.
- Prebuilding one HTML page per catalogue slug via `generateStaticParams` scales with catalogue size in the iOS export; treat that as a known watch item, not a permanent model for large catalogues or personal recipes. See [recipes-and-ingredients.md](../architecture/recipes-and-ingredients.md).
- Capacitor `sync` rebuilds and copies native web assets; it does not replace Vercel deploys.
- Adding a service worker later requires a demonstrated job, cache/update semantics, offline-data behavior, and a new decision record.
- Confirm the bundle ID against any existing App Store app before shipping native.
