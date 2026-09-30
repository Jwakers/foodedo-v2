# Meal selection

Meal selection is a pure domain policy shared by local guest drafts and
authenticated Convex mutations. Callers adapt their own recipe records into
candidate facts; the selector never reads storage, authentication, time, or
random state.

## First-pass policy

Each candidate has a stable key, protein category, and saved status. A request
contains excluded keys, up to four newest-first plan histories, the saved
preference, and a stable variation key. Rules contribute independently:

- saved recipe: `+20` when requested;
- protein not yet represented in the generated plan: `+30`;
- exact meal in history positions 1–4: `-60`, `-35`, `-20`, `-10`;
- historical protein occurrence: `-4`, capped at `-16`; and
- forced repetition in a small pool: `-100`.

Selection first uses unique non-excluded meals, then relaxes exclusions, then
repeats only when necessary. Stable hashing of the variation key orders tied
candidates, so retries reproduce a proposal while separate plan attempts can
explore credible alternatives.

The selector itself truncates supplied history to four plans. This keeps the
policy bounded even if an adapter accidentally provides more data, and keeps
the client and server on the same recency model.

## Boundaries

Plan records do not store a seed, score, or recommendation metadata. Guest
drafts derive variation from their existing timestamps and revisions. Convex
mutations use plan identity, revision, target, and proposal variant. The client
history query is owner-scoped and catalogue-only; server mutations may also use
private recipe keys already available in their candidate pools.

Future rules may add cooked-history, dietary safety constraints, explicit time
or cost preferences, and richer personal-recipe generation. Add each as a
small deterministic rule with tests; do not turn the selector into a generic
settings document or an opaque external service.
