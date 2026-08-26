# Convex migration (V1 → V2)

V2 **must** use a **separate Convex project** from V1. Do not run `npx convex` against V1. Do not share deployments, schema, or functions.

V1 lives at `/Users/jackwakeham/Documents/Projects/foodedo` and remains a live product. `foodedo-cms` and V1's Convex backend are off-limits.

V2 now has its own `foodedo-v2` Convex project and development deployment in Europe (Ireland), plus a committed `convex/` workspace. The deployment is linked through ignored `.env.local` values; no V1 deployment or key is reused.

## Ownership

V2 owns its schema, functions, indexes, migrations, and environments (dev/prod). V1 schema is a reference for _what data exists_, not a template. Design for jobs; see [data-model.md](./data-model.md).

## Why not clone

V1 grew a taxonomy-heavy `recipes` document, a global `ingredients` catalog, households as a first-class unit, chalkboard, generator flags, leftover/scaling metadata on shopping lines, and behaviour stats aimed at a meal-plan generator. V2's thesis is a decision engine. Households are premium-later. Chalkboard is not first-class unless Shop needs a leftover capture path. Prefer history and use-signals for Remember over a generator metadata forest.

## Staged strategy

**snapshot → import → transform → verify → tighten schema**

1. **Snapshot** — Export V1 data the user actually needs (their recipes, ingredients on those recipes, cook/save signals if recoverable). Do not import the entire public/CMS corpus as a prerequisite.
2. **Import** — Load into V2 tables with a loose, optional-heavy schema and an `externalV1Id` (or similar) on migrated documents. Additive fields only at this stage.
3. **Transform** — Map V1 fields into V2 job-oriented shapes in internal mutations. Preserve authored ingredient wording and source attribution, but do not require canonical ingredient matches. Drop unused taxonomy. Flatten nested arrays that should be relations only when queries need them.
4. **Verify** — Spot-check counts, a sample of recipes through Capture/Decide/Shop, and that no V1 deployment was written.
5. **Tighten schema** — Make required fields required only after backfill. Follow Convex migration practice: optional → backfill → required. Indexes for `userId` and job lookups from the start.

Convex does not auto-migrate documents. Safe: optional fields, new tables, new indexes. Breaking: required fields, type changes, renames — those need explicit migrations (`@convex-dev/migrations` when Convex is added).

When migration work begins, use the official **migration-helper** skill if available. Convex AI files are deliberately not installed; this repository's existing agent rules remain authoritative.

## Environments

The separate V2 project has been created. Local agents use `pnpm dev:convex` or `pnpm exec convex dev` on **this** repo only. Never use `npx convex deploy` from development. Cloud coding agents may use Convex agent mode; local development does not need it.

## Auth mapping

V1 users are keyed by Clerk `externalId`. V2 also uses Clerk, but its application configuration and Convex project remain separate. Migration must remap identities in a dedicated, verified step; do not copy V1 Clerk secrets or assume IDs belong to the V2 Clerk instance.
