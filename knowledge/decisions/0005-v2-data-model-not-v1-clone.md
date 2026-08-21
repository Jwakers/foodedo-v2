# 0005 — V2 data model is not a V1 clone

## Status

Accepted

## Context

V1 schema encodes a recipe CMS, household collaboration, a meal-plan generator, chalkboard, and a rich shopping leftover model. Copying it would recreate the product V2 is supposed to simplify.

## Decision

Design a job-oriented model: saved recipes, short-horizon meal slots, derived shopping lists, and recipe events for Remember. Defer households, chalkboard-as-product, ingredients catalog, generator metadata, Discover feeds, and monetisation fields. See `knowledge/architecture/data-model.md`.

## Consequences

- Migration is a transform, not a dump.
- Some V1 features will not exist in V2 until a job requires them.
- V1 code is reference for data meaning only — never a reason to copy UX or tables.
