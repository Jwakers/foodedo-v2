# ADR 0010: Composable meal selection with bounded memory

- **Status:** Accepted
- **Date:** 2026-09-29

## Decision

Use one pure, composable selection policy for every automatic meal choice. It
scores saved preference, within-plan protein variety, and four newest-first
plans of decayed history. Tied candidates use a supplied stable variation key,
not ambient randomness.

## Consequences

The selector is explainable and independently testable. It prevents immediate
and short-cycle repetition when the catalogue has alternatives, while graceful
fallback keeps small catalogues usable. It stores no generation metadata on
meal plans and adds no new user settings. Future signals are rule additions,
not replacements for the plan or recipe contracts.
