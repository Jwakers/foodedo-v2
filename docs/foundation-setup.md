# Foundation setup

What landed in Foodedo V2: a runnable Next.js shell, PWA + Capacitor iOS config, and durable docs. No product features, no auth, no Convex.

## Files created

### App scaffold

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (Next ignored-built-deps)
- `tsconfig.json`, `next.config.ts`, `next-env.d.ts` (generated)
- `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`
- `postcss.config.mjs`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/app/manifest.ts`, `src/app/sw.ts`
- Placeholder icons: `public/web-app-manifest-192x192.png`, `public/web-app-manifest-512x512.png`, `public/apple-touch-icon.png` (solid `#1a3a2a`; real brand later)
- `src/app/favicon.ico` (create-next-app default)

### Structure notes

- `src/components/README.md`
- `src/features/README.md`
- `src/lib/domain/README.md`
- `src/lib/platform/README.md`

### PWA / Capacitor

- `capacitor.config.ts` — `appId: com.foodedo.app`, `webDir: out`, no production `server.url`
- Conditional Next.js static export (`CAPACITOR_BUILD=true`) for the bundled native web assets
- `ios/` — Capacitor 8 Xcode project using Swift Package Manager
- Scripts: `build:ios:web`, `cap:sync:ios`, `cap:open:ios`, `cap:run:ios:live`

### CI

- `playwright.config.ts`, `tests/e2e/pwa.spec.ts` — Chromium production smoke coverage
- `.github/workflows/ci.yml` — format, lint, typecheck, both builds, PWA smoke tests

### Documentation

- `README.md`, `AGENTS.md`, `CLAUDE.md` (points at `AGENTS.md`)
- `docs/technical-spec.md`, `docs/testing.md`, `docs/foundation-setup.md`
- `knowledge/principles/product-principles.md`
- `knowledge/product/vision.md`, `knowledge/product/jobs-to-be-done.md`
- `knowledge/ux/interaction-principles.md`
- `knowledge/architecture/convex-migration.md`, `knowledge/architecture/data-model.md`
- `knowledge/decisions/0001`–`0005`
- `knowledge/skills/README.md`, `knowledge/research/README.md`
- `.cursor/skills/frontend-design/SKILL.md` (copied from V1 for V2 agents)

## Setup decisions

| Decision                                                                | Rationale                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16.3 App Router, `src/`, Tailwind v4, ESLint, Turbopack **dev** | Current `create-next-app`; matches V1 layout (`src/`).                                                                                          |
| `next build --webpack`                                                  | `@serwist/next` injects webpack. Next 16 defaults to Turbopack builds; that combination currently fails.                                        |
| Serwist disabled in development                                         | Avoid SW fighting HMR; PWA is a production concern.                                                                                             |
| Normal Vercel build + dedicated iOS static export                       | Preserve server-capable web deployment while giving Capacitor compiled assets to package.                                                       |
| Capacitor 8, iOS only, `webDir: out`, no production `server.url`        | Follows Capacitor's production asset workflow. Remote URLs are for development live reload only.                                                |
| Bundle ID `com.foodedo.app`                                             | Reverse-DNS for the consumer product. V2 is a rewrite, not a side-by-side “v2” app. Confirm vs any existing App Store ID before native release. |
| Orientation remains unlocked                                            | Web manifest and iOS agree; rotation remains available for accessibility until product UX justifies a constraint.                               |
| No Convex, no auth, no shadcn                                           | Foundation only. Convex will be a **new** project later.                                                                                        |
| Playwright PWA smoke + complete CI checks                               | Protect installability and both deployment modes before feature E2E tests exist.                                                                |
| pnpm                                                                    | Matches V1 and sibling projects.                                                                                                                |

## Assumptions

- V1 remains the live product; this repo never deploys to V1 Convex.
- `com.foodedo.app` is free / acceptable; change before App Store submit if V1 already owns a different ID.
- Placeholder icons and Geist fonts are temporary; brand and UI system come later.
- CocoaPods is unused; Capacitor 8 iOS used Swift Package Manager (`Package.swift`).
- Local iOS live reload needs the Mac and phone/simulator on the same LAN; pass the machine's IP to the Capacitor live-reload CLI.

## Risks

- **Serwist + Turbopack:** production must keep webpack until Serwist's Turbopack support is adopted (`@serwist/turbopack` is experimental).
- **Dual-build compatibility:** routes shipped in iOS must remain statically exportable. Server Actions, request cookies, and other server-only Next features need a deliberate web/native split.
- **Migration:** treating V1 schema as a template would recreate the wrong product.
- **Bundle ID collision** with any existing Foodedo iOS app.
- **Native compilation:** the web bundle and Capacitor sync are automated, but a full simulator/archive build still requires Xcode and signing validation.

## Recommended first feature step

After Convex (new project) and auth exist, ship a **Capture → Decide** vertical slice — not settings, households, discovery, or a dashboard.

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

### PWA

- Manifest at `/manifest.webmanifest`.
- Service worker generated to `public/sw.js` on **production** build (gitignored).
- In Chrome/Safari, install from a deployed HTTPS origin. `pnpm dev` does not register the SW.
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
- `pnpm test:e2e` — Chromium verifies shell, manifest, icons, and service worker
- `pnpm cap:sync:ios` — copies the static export; generated native config has no `server.url`
- V1 git status — clean
- No Convex project created
- Full Xcode simulator build — dependencies resolve, but this Mac needs its Xcode platform/CoreSimulator components updated before it has an eligible simulator destination
