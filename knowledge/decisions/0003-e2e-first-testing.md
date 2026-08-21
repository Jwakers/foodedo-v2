# 0003 — E2E-first testing

## Status

Accepted

## Context

A solo developer needs a safety net that fails when user jobs break, not when implementation details move. Domain logic (scoring, import transforms) is the exception: it is deterministic and UI-independent.

## Decision

- Primary net: Playwright E2E against real jobs (Decide, Plan, Capture, Shop, Cook).
- Unit/integration tests only for domain logic in `src/lib/domain` (and later Convex pure helpers).
- Bugs get a regression test at the cheapest correct layer.
- CI enforces format, lint, typecheck, both production builds, and a Chromium PWA smoke now. Job-oriented E2E grows with each feature slice.

## Consequences

- Do not install a large unit-test graph for React components by default.
- The foundation carries only a focused Playwright production smoke; it should not grow into implementation-detail coverage. See `docs/testing.md`.
