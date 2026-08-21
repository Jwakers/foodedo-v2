# Foodedo V2 — technical specification

## 1. Product

Foodedo is a decision-making engine for food. Capabilities (recipes, plans, lists, import, recommendations) serve that thesis; they are not the thesis.

Authoritative product writing:

- [Product principles](../knowledge/principles/product-principles.md)
- [Vision](../knowledge/product/vision.md)
- [Jobs to be done](../knowledge/product/jobs-to-be-done.md)
- [Interaction principles](../knowledge/ux/interaction-principles.md)

**Feature test:** Does this reduce thinking, effort, or friction required to decide what to eat and make it happen?

## 2. Initial stack (foundation)

| Layer           | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| App             | Next.js 16 App Router, React 19, TypeScript (strict), `src/` |
| Styling         | Tailwind CSS v4                                              |
| PWA             | Web app manifest + Serwist (`@serwist/next`)                 |
| Native          | Capacitor 8, **iOS only**, packages a Next.js static export  |
| Package manager | pnpm                                                         |
| Quality         | ESLint (`eslint-config-next` + Prettier), `tsc --noEmit`     |
| CI              | Format, lint, typecheck, both builds, Chromium PWA smoke     |
| Hosting (web)   | Vercel (when deployed)                                       |

**Not in the foundation:** Convex runtime, `schema.ts`, auth, shadcn, product features, or Android. Static export is used only for the native bundle; it is not the Vercel deployment mode.

## 3. In vs later

**Now:** placeholder route, PWA shell, Capacitor config, docs, CI, folder conventions.

**Next backend milestone:** new Convex project + auth (not V1's deployment).

**Later product:** Capture → Decide → Plan → Shop → Cook → Remember. Discover after Remember has signal.

**Later native:** camera, photos, share sheet, haptics, push, deep links.

**Optional later UI:** shadcn/ui if primitives are needed; do not install on speculation.

**Not initial build:** subscriptions, ads, households, CMS, social.

## 4. Architecture philosophy

- **Feature boundaries** under `src/features/{capture,decide,plan,shop,cook,remember}`.
- **Strong TypeScript.** No `any`. Prefer Convex/generated types when the backend exists.
- **Server/client separation.** Default to Server Components. `"use client"` only for interaction.
- **Domain vs platform.** `src/lib/domain` is React-free. `src/lib/platform` holds web/PWA/Capacitor adapters.
- **Small composable components** when UI exists. No design-system install in the foundation.
- **Existing V2 code is not more authoritative than principles.** V1 is migration insight only.

Convex is the planned backend: queries/mutations/actions, indexes, custom authed functions — in a **separate project** from V1. See [convex-migration.md](../knowledge/architecture/convex-migration.md) and [data-model.md](../knowledge/architecture/data-model.md).

## 5. Runtime: Next.js → PWA → Capacitor iOS

1. Develop with `pnpm dev` (Turbopack). Service worker is **disabled in development**.
2. Production/preview web: Vercel. `pnpm build` uses webpack because `@serwist/next` injects a webpack plugin and is not Turbopack-compatible yet. Serwist precaches the app shell; runtime caching uses Serwist defaults. Manifest: `display: standalone`, start URL `/`. Placeholder icons in `public/`; real brand assets later.
3. Production iOS: `pnpm build:ios:web` sets `CAPACITOR_BUILD=true`, enabling Next.js `output: 'export'` and generating `out/`. Capacitor packages those compiled assets through `webDir: 'out'`. It does not load the deployed website through `server.url`.

The dual build is deliberate. The Vercel build can use server-capable Next.js features; any route shipped inside iOS must also pass the static-export build. Dynamic native data should come from client-side Convex calls or an explicit external API. Cookies, Server Actions, request-dependent Route Handlers, and dynamic routes without `generateStaticParams` cannot be introduced into shared native routes accidentally.

Scripts: `build:ios:web`, `cap:sync:ios`, `cap:open:ios`, and development-only `cap:run:ios:live`. Android is not added. `server.url` may be supplied temporarily by Capacitor's live-reload CLI but must not be committed or shipped.

If the `ios/` native project is missing, a human runs `pnpm exec cap add ios` on a Mac with Xcode.

## 6. Quality standard

Fast, mobile-first, accessible (semantic HTML, contrast, 44px targets, safe areas, reduced motion). Resilient empty/loading states. Intentional hierarchy — not a card-grid dashboard. Interaction model in the UX principles doc.

## 7. Testing

See [testing.md](./testing.md). Playwright currently checks the production app shell, manifest, icons, and service-worker registration in Chromium. Grow E2E coverage with real jobs; keep unit tests for domain logic only. Bug-driven tests thereafter.

## 8. V2 scope discipline

Focus the first slices on Capture and Decide, then Plan/Shop/Cook/Remember. Do not start with settings, households, discovery feeds, or dashboards.

Do not touch `/Users/jackwakeham/Documents/Projects/foodedo` (V1), `foodedo-cms`, or V1 Convex.

## 9. Folder conventions

```
src/app/                 App Router (only `/` in the foundation)
src/components/          Shared UI later
src/features/            Job modules later
src/lib/domain/          Platform-independent logic
src/lib/platform/        Web / PWA / Capacitor adapters
docs/                    Technical specs
knowledge/               Principles, product, UX, architecture, ADRs, skills
ios/                     Capacitor iOS (generated)
out/                     Generated native web bundle (gitignored)
```

## 10. Coding conventions (foundation)

- pnpm only.
- Prettier for format; ESLint for Next + TS; Prettier config disables conflicting ESLint format rules.
- Await all promises in future Convex functions; validators on public functions; no `Date.now()` in queries.
- Never schedule public `api` functions — internal only, when Convex exists.
- Keep shared native routes static-export compatible; run both production builds after routing or data-access changes.
- Use `npx convex dev` for Convex development; `deploy` is production only — and only for the **V2** project.

## 11. Related ADRs

- [0001 Separate Convex project](../knowledge/decisions/0001-separate-convex-project.md)
- [0002 Next.js PWA + Capacitor](../knowledge/decisions/0002-nextjs-pwa-capacitor-runtime.md)
- [0003 E2E-first testing](../knowledge/decisions/0003-e2e-first-testing.md)
- [0004 No auth/Convex in foundation](../knowledge/decisions/0004-no-auth-or-convex-in-foundation.md)
- [0005 Data model is not a V1 clone](../knowledge/decisions/0005-v2-data-model-not-v1-clone.md)
