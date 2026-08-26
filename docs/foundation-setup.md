# Foundation setup

This is the historical record of the original shell foundation: a runnable Next.js web shell, Capacitor iOS config, and durable docs. It initially contained no product features, auth, or Convex. The subsequent Convex + Clerk milestone is documented in [auth-and-backend-setup.md](./auth-and-backend-setup.md) and [ADR 0008](../knowledge/decisions/0008-convex-and-clerk.md).

## Files created

### App scaffold

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (Next ignored-built-deps)
- `tsconfig.json`, `next.config.ts`, `next-env.d.ts` (generated)
- `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`
- `postcss.config.mjs`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/app/manifest.ts`
- Placeholder icons: `public/web-app-manifest-192x192.png`, `public/web-app-manifest-512x512.png`, `public/apple-touch-icon.png` (solid `#1a3a2a`; real brand later)
- `src/app/favicon.ico` (create-next-app default)

### Structure notes

- `src/components/README.md`
- `src/features/README.md`
- `src/lib/domain/README.md`
- `src/lib/platform/README.md`

### Web metadata / Capacitor

- `capacitor.config.ts` — `appId: com.foodedo.app`, `webDir: out`, no production `server.url`
- Conditional Next.js static export (`CAPACITOR_BUILD=true`) for the bundled native web assets
- `ios/` — Capacitor 8 Xcode project using Swift Package Manager
- Scripts: `build:ios:web`, `cap:sync:ios`, `cap:open:ios`, `cap:run:ios:live`

### CI

- `playwright.config.ts`, `tests/e2e/app-shell.spec.ts` — Chromium production smoke coverage
- `.github/workflows/ci.yml` — format, lint, typecheck, both builds, and web-shell smoke tests

### Documentation

- `README.md`, `AGENTS.md`, `CLAUDE.md` (points at `AGENTS.md`)
- `docs/technical-spec.md`, `docs/testing.md`, `docs/foundation-setup.md`
- `knowledge/principles/product-principles.md`
- `knowledge/product/vision.md`, `knowledge/product/jobs-to-be-done.md`
- `knowledge/ux/interaction-principles.md`
- `knowledge/architecture/convex-migration.md`, `knowledge/architecture/data-model.md`
- `knowledge/decisions/0001`–`0008`
- `knowledge/skills/README.md`, `knowledge/research/README.md`
- `.cursor/skills/frontend-design/SKILL.md` (copied from V1 for V2 agents)

## Setup decisions

| Decision                                                                | Rationale                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.3 App Router, `src/`, Tailwind v4, ESLint, default Turbopack | Current `create-next-app`; matches V1 layout (`src/`) and keeps both development and production builds on the supported default path.           |
| Web manifest without a service worker                                   | Retains lightweight home-screen metadata without adding cache lifecycle, offline, or background-sync responsibilities before they are needed.   |
| Normal Vercel build + dedicated iOS static export                       | Preserve server-capable web deployment while giving Capacitor compiled assets to package.                                                       |
| Capacitor 8, iOS only, `webDir: out`, no production `server.url`        | Follows Capacitor's production asset workflow. Remote URLs are for development live reload only.                                                |
| Bundle ID `com.foodedo.app`                                             | Reverse-DNS for the consumer product. V2 is a rewrite, not a side-by-side “v2” app. Confirm vs any existing App Store ID before native release. |
| Orientation remains unlocked                                            | Web manifest and iOS agree; rotation remains available for accessibility until product UX justifies a constraint.                               |
| No Convex, no auth, no shadcn                                           | Original foundation scope. The later backend milestone created a **new** V2 project and selected Clerk.                                         |
| Playwright web-shell smoke + complete CI checks                         | Protect the shell, metadata, and both deployment modes before feature E2E tests exist.                                                          |
| pnpm                                                                    | Matches V1 and sibling projects.                                                                                                                |

## Assumptions

- V1 remains the live product; this repo never deploys to V1 Convex.
- `com.foodedo.app` is free / acceptable; change before App Store submit if V1 already owns a different ID.
- Placeholder icons are temporary; brand and UI typography come later. The shell uses a dependency-free system font stack.
- CocoaPods is unused; Capacitor 8 iOS used Swift Package Manager (`Package.swift`).
- Local iOS live reload needs the Mac and phone/simulator on the same LAN; pass the machine's IP to the Capacitor live-reload CLI.

## Risks

- **No offline web mode:** the browser experience requires connectivity. Add a service worker only when a specific user job and cache/update policy justify it.
- **Dual-build compatibility:** routes shipped in iOS must remain statically exportable. Server Actions, request cookies, and other server-only Next features need a deliberate web/native split.
- **Migration:** treating V1 schema as a template would recreate the wrong product.
- **Bundle ID collision** with any existing Foodedo iOS app.
- **Native compilation:** the web bundle and Capacitor sync are automated, but a full simulator/archive build still requires Xcode and signing validation.

## Recommended first feature step

First establish the **recipe kernel** used by every later job: bounded recipe content, lossless ingredient lines, provenance, and private authenticated persistence. Keep catalogue content separate from personal recipes and defer canonical taxonomy and publishing. See [`recipes-and-ingredients.md`](../knowledge/architecture/recipes-and-ingredients.md).

Then prove a **guest → account identity slice**: a visitor reaches a useful Decide/Plan result from the same standard meal catalogue available to account holders, chooses to keep it, authenticates, and sees the same draft safely claimed into V2. The early catalogue may be small and bundled, but it is not a guest access tier. See [`identity-and-guest.md`](../knowledge/architecture/identity-and-guest.md).

Then ship the first personal **Capture → Decide** vertical slice — not settings, households, discovery, or a dashboard.

1. **Capture:** user saves one recipe with almost no form (share/paste/URL first; manual fields as fallback).
2. **Decide:** immediately help them answer “what are we eating?” from that saved food (even a single item plus empty-state honesty is better than a card grid).

Capture without Decide is a recipe box. Decide without Capture has nothing to think with. Together they prove the North Star. Plan/Shop/Cook/Remember hang off the same saved dish.

## How to run

### Web

```bash
pnpm install
pnpm dev
```

[http://localhost:3000](http://localhost:3000) — product name + North Star only.

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build:ios:web
pnpm build
pnpm test:e2e
pnpm start
```

### Web manifest / Add to Home Screen

- Manifest at `/manifest.webmanifest`.
- Manifest icons and Apple metadata provide lightweight home-screen support from a deployed HTTPS origin.
- There is deliberately no service worker, separate PWA channel, or offline-web promise at this stage.
- Icons are placeholders.

### Capacitor iOS

Already added in this environment. On a Mac with Xcode:

```bash
# Builds `out/`, then copies it into the iOS project.
pnpm cap:sync:ios
pnpm cap:open:ios
```

For development live reload, run `pnpm dev`, then pass the LAN host explicitly. Capacitor applies the remote URL to that development run; it is not stored in production config:

```bash
pnpm cap:run:ios:live --host 192.168.x.x --port 3000
```

If `ios/` is missing on another clone:

```bash
pnpm exec cap add ios
pnpm cap:sync:ios
```

Do not add Android. Native plugins (camera, photos, share, haptics, push, deep links) are later.

## Verification (this setup)

- `pnpm lint` — pass
- `pnpm typecheck` — pass
- `pnpm build:ios:web` — pass; emits a bundled static app in `out/`
- `pnpm build` — pass (`/`, `/_not-found`, `/manifest.webmanifest` only)
- `pnpm test:e2e` — Chromium verifies the shell, manifest, and icons
- `pnpm cap:sync:ios` — copies the static export; generated native config has no `server.url`
- V1 git status — clean
- No Convex project existed at the original foundation checkpoint; a separate V2 project now exists under ADR 0008
- Full Xcode simulator build — dependencies resolve, but this Mac needs its Xcode platform/CoreSimulator components updated before it has an eligible simulator destination
