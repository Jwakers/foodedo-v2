# 0004 — No auth or Convex in the foundation

## Status

Accepted

## Context

The foundation must be a runnable Next.js web/iOS shell with documentation. Auth and Convex would force product decisions (Clerk vs Convex Auth, schema freeze) before jobs exist.

## Decision

The foundation includes neither authentication nor a Convex deployment (`npx convex dev`, `schema.ts`, functions). They are the first backend milestone after this shell, still in a **new** Convex project.

## Consequences

- Placeholder UI only; no fake logged-in dashboard.
- Agents must not add Convex “just to be ready.”
- Persistent personal-data slices wait on Convex + auth. A bounded guest activation slice may prove Decide → Plan locally first, following ADR 0006.
