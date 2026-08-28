# Foodedo V2 — technical specification

## 1. Product

Foodedo is a decision-making engine for food. Capabilities (recipes, plans, lists, import, recommendations) serve that thesis; they are not the thesis.

Authoritative product writing:

- [Product principles](../knowledge/principles/product-principles.md)
- [Vision](../knowledge/product/vision.md)
- [Jobs to be done](../knowledge/product/jobs-to-be-done.md)
- [Interaction principles](../knowledge/ux/interaction-principles.md)
- [Identity and guest access](../knowledge/architecture/identity-and-guest.md)

**Feature test:** Does this reduce thinking, effort, or friction required to decide what to eat and make it happen?

## 2. Initial stack (foundation)

| Layer           | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| App             | Next.js 16 App Router, React 19, TypeScript (strict), `src/` |
| Styling         | Tailwind CSS v4                                              |
| Iconography     | Lucide React                                                 |
| Backend         | Convex 1.x, separate V2 project                              |
| Authentication  | Clerk client auth + Convex JWT validation                    |
| Web metadata    | Manifest + icons; no service worker or offline-web promise   |
| Native          | Capacitor 8, **iOS only**, packages a Next.js static export  |
| Package manager | pnpm                                                         |
| Quality         | ESLint (`eslint-config-next` + Prettier), `tsc --noEmit`     |
| CI              | Format, lint, typecheck, both builds, Chromium web smoke     |
| Hosting (web)   | Vercel (when deployed)                                       |

The original shell and auth foundations are complete. The recipe kernel adds private authenticated persistence, platform-independent recipe contracts, and a guest-visible standard catalogue with an authenticated save proof. It does not add manual recipe management, taxonomy, publishing, shadcn, or Android. Static export is used only for the native bundle; it is not the Vercel deployment mode.

## 3. In vs later

**Now:** focused product shell, home-screen metadata, Capacitor config, separate V2 Convex project, Clerk integration, user synchronization, recipe foundation, docs, CI, and folder conventions.

**Recipe foundation — complete:** bounded recipe content, lossless ingredient lines, provenance, a versioned standard catalogue, private ownership, explicit library membership, authenticated idempotent catalogue saving, and domain tests now exist. Plan-only snapshots do not appear in **My recipes** unless the user deliberately saves them.

**Guest Plan claim — foundation complete:** `GuestDraftV1` holds seven consecutive dated choices in IndexedDB. Guests can swap or shuffle meals, then **Keep this plan** persists an idempotent intent before sign-in. Authenticated app state first hydrates the current Convex plan, preventing a second device from submitting an already-saved date range. Otherwise it resumes one atomic claim that creates a minimal `mealPlans` parent, private recipe snapshots, and independently editable dated slots without overwriting occupied dates. Matching local state is deleted only after server confirmation; different unsaved state is retained and disclosed. Catalogue recipe saving uses the same persisted sign-in-continuation and post-save cleanup pattern.

**Plan interface — MVP complete:** authenticated users can open recipes from dated slots, swap one meal, review alternative plans without changing the active plan, or explicitly archive it and start another. Accepting an alternative preserves elapsed slots, archives the previous plan atomically, and offers immediate recovery. Guest and authenticated flows share a small deterministic selection strategy in the domain layer. That strategy is intentionally replaceable by later preference-aware scoring without changing plan storage or UI mutation contracts.

**Later product:** Capture → Decide → Plan → Shop → Cook → Remember. Discover after Remember has signal.

**Later native:** camera, photos, share sheet, haptics, push, deep links.

**Optional later UI:** shadcn/ui if primitives are needed; do not install on speculation.

**Not initial build:** subscriptions, premium meal delivery, ads, households, CMS, social.

## 4. Architecture philosophy

- **Feature boundaries** under `src/features/{capture,decide,plan,shop,cook,remember}`.
- **Strong TypeScript.** No `any`. Prefer Convex/generated types when the backend exists.
- **Server/client separation.** Default to Server Components. `"use client"` only for interaction.
- **Domain vs platform.** `src/lib/domain` is React-free. `src/lib/platform` holds web/Capacitor adapters.
- **Small composable components** when UI exists. No design-system install in the foundation.
- **Semantic Tailwind v4 tokens.** Role-based CSS variables such as `--foreground` remain available to plain CSS and are mapped through `@theme inline` to utilities such as `text-foreground`, `text-accent`, `bg-surface`, and `border-border`. Product markup should prefer those utilities over arbitrary CSS-variable colour expressions.
- Add component-specific tokens only when a genuinely recurring semantic role needs a distinct value. Typography/layout composition should not create speculative colour tokens.
- **Existing V2 code is not more authoritative than principles.** V1 is migration insight only.

Convex is the backend: queries/mutations/actions, indexes, custom authenticated functions—in a **separate project** from V1. Clerk provides identity; Convex validates its JWT and remains responsible for authorization. See [convex-migration.md](../knowledge/architecture/convex-migration.md), [data-model.md](../knowledge/architecture/data-model.md), and [the setup guide](./auth-and-backend-setup.md).

Personal recipes are private snapshots. Catalogue content, future publications, and canonical ingredient enrichment remain separate layers; see [recipes-and-ingredients.md](../knowledge/architecture/recipes-and-ingredients.md).

The current catalogue uses real `/recipes/[slug]` pages. A catalogue slug is a unique, human-readable URL value distinct from the stable internal catalogue ID used by plans and saved snapshots. Every bundled slug is generated at build time, so the same URLs work on Vercel and in Capacitor's static iOS bundle without a query-string router. Routes for future user-created recipes will be designed with duplicate handling and that native static-export constraint when Capture adds them; they are not simulated ahead of the data source.

Meal-plan hydration treats plan/slot identity as durable even if a recipe reference is unexpectedly unavailable: the affected slot is returned as unavailable and the rest of the plan remains usable. Future recipe deletion must preserve referential integrity transactionally.

The bundled catalogue currently contains 23 lightweight meals to make plan testing meaningful. Their extra detail is temporary; their stable IDs and slugs still follow the real catalogue contract.

Guest mode is not unauthenticated personal storage. The initial standard catalogue and guest draft can be local; persistent personal Convex access requires authentication. Standard catalogue meals are not auth-gated. Future premium meals require authentication plus a server-verified active subscription. See [ADR 0006](../knowledge/decisions/0006-guest-first-account-boundary.md) and [ADR 0007](../knowledge/decisions/0007-standard-meals-and-future-premium-entitlement.md).

## 5. Runtime: Next.js web → Capacitor iOS

1. Develop with `pnpm dev`. Next.js 16 uses Turbopack by default.
2. Production/preview web: Vercel. `pnpm build` uses the Next.js 16 default Turbopack build. The manifest (`display: standalone`, start URL `/`), icons, and Apple metadata make Add to Home Screen available as a progressive enhancement; Foodedo does not maintain a separate PWA channel. There is no service worker or general offline-web guarantee.
3. Production iOS: `pnpm build:ios:web` sets `CAPACITOR_BUILD=true`, enabling Next.js `output: 'export'` and generating `out/`. Capacitor packages those compiled assets through `webDir: 'out'`. It does not load the deployed website through `server.url`.

The dual build is deliberate. The Vercel build can use server-capable Next.js features; any route shipped inside iOS must also pass the static-export build. Dynamic native data should come from client-side Convex calls or an explicit external API. Cookies, Server Actions, request-dependent Route Handlers, and dynamic routes without `generateStaticParams` cannot be introduced into shared native routes accidentally.

The packaged iOS origin is `capacitor://localhost`. Clerk's web SDK remains in standard-browser mode inside the cookie-capable `WKWebView`, and the Clerk instance requires that origin in `allowed_origins`. `standardBrowser=false` is reserved for a client with a native token/request adapter and is not a standalone Capacitor switch. For social/SSO, the Capacitor build injects one isolated Clerk OAuth transport: a narrow local Capacitor plugin presents Apple's `ASWebAuthenticationSession`, Clerk returns to an allowlisted HTTPS Convex HTTP action, and that bridge opens `com.foodedo.app://callback` for the authentication session to capture and dismiss automatically. The HTTPS bridge is required while Foodedo uses Clerk's browser-mode React SDK because that flow rejects a custom-scheme callback directly; registering the iOS app in Clerk does not change the SDK mode. The app scheme must be registered in Xcode, and the bridge URL must be registered in Clerk's mobile SSO redirect allowlist.

Scripts: `build:ios:web`, `cap:sync:ios`, `cap:open:ios`, and development-only `cap:run:ios:live`. Android is not added. `server.url` may be supplied temporarily by Capacitor's live-reload CLI but must not be committed or shipped.

If the `ios/` native project is missing, a human runs `pnpm exec cap add ios` on a Mac with Xcode.

## 6. Quality standard

Fast, mobile-first, accessible (semantic HTML, contrast, 44px targets, safe areas, reduced motion). Resilient empty/loading states. Intentional hierarchy — not a card-grid dashboard. Interaction model in the UX principles doc.

## 7. Testing

See [testing.md](./testing.md). Playwright checks durable production behaviour in Chromium. Keep E2E assertions centred on navigation and real jobs rather than transient copy; keep unit tests for domain logic only. Bug-driven tests thereafter.

## 8. V2 scope discipline

Focus the first slices on Capture and Decide, then Plan/Shop/Cook/Remember. Do not start with settings, households, discovery feeds, or dashboards.

Before expanding the product, manually prove the completed identity boundary end to end in release-like web and iOS builds: guest value, account prompt at the save boundary, email/Google authentication, automatic claim, retry/conflict behavior, and authenticated reload.

Do not touch `/Users/jackwakeham/Documents/Projects/foodedo` (V1), `foodedo-cms`, or V1 Convex.

## 9. Folder conventions

```
src/app/                 App Router routes (`/`, `/recipes`, `/recipes/[slug]`)
src/components/          Shared UI later
src/features/            Job modules later
src/lib/domain/          Platform-independent logic
src/lib/platform/        Web / Capacitor adapters
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
- Fail Next.js startup/build when required public Clerk or Convex configuration is missing; product components assume their providers exist.
- Use `pnpm exec convex dev` for Convex development; `deploy` is production only—and only for the **V2** project.

## 11. Related ADRs

- [0001 Separate Convex project](../knowledge/decisions/0001-separate-convex-project.md)
- [0002 Next.js web + Capacitor](../knowledge/decisions/0002-nextjs-web-capacitor-runtime.md)
- [0003 E2E-first testing](../knowledge/decisions/0003-e2e-first-testing.md)
- [0004 No auth/Convex in foundation](../knowledge/decisions/0004-no-auth-or-convex-in-foundation.md)
- [0005 Data model is not a V1 clone](../knowledge/decisions/0005-v2-data-model-not-v1-clone.md)
- [0006 Guest-first account boundary](../knowledge/decisions/0006-guest-first-account-boundary.md)
- [0007 Standard meals and future premium entitlement](../knowledge/decisions/0007-standard-meals-and-future-premium-entitlement.md)
- [0008 Convex and Clerk](../knowledge/decisions/0008-convex-and-clerk.md)
