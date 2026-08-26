# Foodedo V2

A **decision-making engine for food**. Foodedo should think so you don't have to.

This repository is a **rewrite**. It is not Foodedo V1.

V1 is a separate live app in its own repository. Do not migrate, deploy, or edit V1 from here. V2 uses its own **new Convex project** and Clerk application configuration; never reuse V1's Convex deployment, Clerk application, or secrets.

## North Star

Reduce thinking, organising, and repetitive decision-making about what to eat and how to make it happen. Full principles: [`knowledge/principles/product-principles.md`](knowledge/principles/product-principles.md).

## What's here now

A Next.js 16 App Router shell (TypeScript, Tailwind v4, web manifest, Capacitor 8 configured for iOS), a separate V2 Convex backend, and client-side Clerk authentication wired through `ConvexProviderWithClerk`. The private recipe kernel now provides bounded domain contracts and authenticated persistence, but there is still no recipe-management interface. Vercel uses the normal Next.js build; the iOS app packages a dedicated static export.

## Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

`pnpm dev` runs Convex and Next.js together after environment setup. Use `pnpm dev:web` when Convex is already running in another terminal or only the frontend is needed. Complete [the Convex and Clerk setup](docs/auth-and-backend-setup.md) before testing sign-in.

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:unit
pnpm build
pnpm build:ios:web
pnpm test:e2e
```

Web: the manifest, icons, and Apple metadata support optional Add to Home Screen. There is deliberately no service worker or offline-web promise. Icons in `public/` are placeholders.

iOS: see [`docs/foundation-setup.md`](docs/foundation-setup.md). With Xcode installed, `pnpm cap:sync:ios` builds the static web bundle and copies it into the native project; then run `pnpm cap:open:ios`. `server.url` is never used for production.

## Docs

- [`docs/technical-spec.md`](docs/technical-spec.md)
- [`docs/testing.md`](docs/testing.md)
- [`docs/foundation-setup.md`](docs/foundation-setup.md)
- [`docs/auth-and-backend-setup.md`](docs/auth-and-backend-setup.md) — required Convex and Clerk dashboard configuration
- [`docs/production-pre-launch-checklist.md`](docs/production-pre-launch-checklist.md) — production, App Store, security, auth, and operational release gates
- [`knowledge/architecture/identity-and-guest.md`](knowledge/architecture/identity-and-guest.md) — guest/account boundary and auth evaluation
- [`knowledge/architecture/recipes-and-ingredients.md`](knowledge/architecture/recipes-and-ingredients.md) — recipe, ingredient, provenance, and publishing boundaries
- [`knowledge/`](knowledge/) — principles, JTBD, UX, architecture, ADRs
- [`AGENTS.md`](AGENTS.md) — how agents should work in this repo
