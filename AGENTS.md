<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Foodedo V2 — agent instructions

## Authority (highest first)

1. **Explicit instruction** in the current user/chat message.
2. **Product principles / North Star** — `knowledge/principles/product-principles.md`.
3. **Technical spec / architecture** — `docs/technical-spec.md`, `knowledge/architecture/`.
4. **Feature docs** — when they exist under `knowledge/` or `src/features/`.
5. **Existing code** in this repo.

Existing V2 code is **not** authoritative when it conflicts with (1)–(4). V1 code (`/Users/jackwakeham/Documents/Projects/foodedo`) is a **reference for migration insight only**. Never copy V1 UX, schema, or features because “that's how V1 did it.”

## Hard constraints

- Do not modify Foodedo V1, `foodedo-cms`, or V1's Convex backend.
- Clerk and Convex are the accepted V2 identity/backend stack. Do not add another auth provider, anonymous backend users, or unrelated product schema unless asked.
- Do not use `npx convex deploy` in development. When Convex exists, use `npx convex dev` on **this** project only — a **new** Convex project, never V1's.
- Package manager: pnpm.
- iOS only for Capacitor; no Android.
- Shared native routes must remain compatible with the Capacitor static-export build. Do not add a server-only Next.js dependency to one without an explicit architecture decision and a native alternative.
- Guest access does not authorize personal Convex writes or anonymous backend users. Keep guest drafts local and follow `knowledge/architecture/identity-and-guest.md`.

## Skills

Use skills **selectively**. See `knowledge/skills/README.md`.

- Product UI later: `.cursor/skills/frontend-design/SKILL.md`
- Next.js App Router: Vercel plugin `nextjs` skill
- After editing several TSX files: Vercel `react-best-practices` skill
- Convex: use official plugin skills when available. Dependencies and the V2 project already exist; do not install Convex AI files or switch deployments without explicit need.
- Accessibility: `knowledge/ux/interaction-principles.md`

## Coding

TypeScript strict, Server Components by default, feature folders for jobs, domain logic free of React/Capacitor. Format with Prettier. Lint and typecheck must stay green. Follow Convex workspace rules once `convex/` exists (validators, awaits, indexes, no `Date.now()` in queries, schedule `internal` only).

Run both `pnpm build` and `pnpm build:ios:web` when changing routing, rendering, or data access. The first verifies the Vercel web build; the second verifies the bundle Capacitor ships.
