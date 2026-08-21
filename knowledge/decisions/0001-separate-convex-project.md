# 0001 — Separate Convex project

## Status

Accepted

## Context

Foodedo V1 is a live product with its own Convex deployment, schema, and functions. V2 is a rewrite with a different thesis (decision engine vs accumulated V1 surface). Sharing a backend would couple releases, risk live data, and freeze V2 to V1's schema.

## Decision

V2 uses a **new Convex project**. V1 is never modified from this repository. Schema, indexes, migrations, and environments are owned here when Convex is added — not now.

## Consequences

- Migration is snapshot → import → transform → verify → tighten, not “point the app at V1.”
- Two backends to operate until V1 is retired.
- Agents must not run `npx convex` in the V1 tree or reuse V1 deploy keys.
