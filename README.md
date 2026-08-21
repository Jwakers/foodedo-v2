# Foodedo V2

A **decision-making engine for food**. Foodedo should think so you don't have to.

This repository is a **rewrite**. It is not Foodedo V1.

V1 is a separate live app at `/Users/jackwakeham/Documents/Projects/foodedo`. Do not migrate, deploy, or edit V1 from here. V2 will use a **new Convex project** when the backend is added; that is not set up yet.

## North Star

Reduce thinking, organising, and repetitive decision-making about what to eat and how to make it happen. Full principles: [`knowledge/principles/product-principles.md`](knowledge/principles/product-principles.md).

## What's here now

A Next.js 16 App Router shell (TypeScript, Tailwind v4, PWA via Serwist, Capacitor 8 configured for iOS). Vercel uses the normal Next.js build; the iOS app packages a dedicated static export. Placeholder home page only. No auth, no Convex, no product features.

## Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm build:ios:web
pnpm test:e2e
```

PWA: installability is for production builds (service worker disabled in `next dev`). Icons in `public/` are placeholders.

iOS: see [`docs/foundation-setup.md`](docs/foundation-setup.md). With Xcode installed, `pnpm cap:sync:ios` builds the static web bundle and copies it into the native project; then run `pnpm cap:open:ios`. `server.url` is never used for production.

## Docs

- [`docs/technical-spec.md`](docs/technical-spec.md)
- [`docs/testing.md`](docs/testing.md)
- [`docs/foundation-setup.md`](docs/foundation-setup.md)
- [`knowledge/`](knowledge/) — principles, JTBD, UX, architecture, ADRs
- [`AGENTS.md`](AGENTS.md) — how agents should work in this repo
