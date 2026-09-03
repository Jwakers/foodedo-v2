# ADR 0009: Separate plan adjustments from usual planning preferences

- **Status:** Accepted
- **Date:** 2026-09-02

## Context

The approved pre-plan design lets a signed-in user adjust days, start date, servings, and the use of saved recipes. It also asks, only after a meaningful change, whether that change applies to **This plan only** or **This and future plans**.

A one-off week must not corrupt the user's normal routine. Equally, a real change in routine should not require a trip into Settings. The actual start date of the plan being created is not a reusable preference.

Guests can experience the core planning loop with sensible defaults, but durable personal preferences require an authenticated owner.

## Decision

Keep three separate kinds of state:

1. **Pre-generation adjustment state** lives locally in the planning interface. It includes the actual start date and the values about to be used by generation.
2. **Usual planning preferences** belong to one authenticated planning-preferences record. The initial fields are usual plan days, usual servings, and whether to prioritise saved recipes.
3. **Accepted plan facts** belong to the generated plan when they affect downstream behaviour. In particular, the plan's serving count must remain available to Cook and Shop even when it came from a temporary override.

`This plan only` is the default. It does not update usual planning preferences.

`This and future plans` applies the current generation values and patches only persistent-capable fields the user actually changed. It never persists the actual start date or overwrites unrelated profile settings.

Dietary requirements and allergies are a separate, independently persistent profile capability. They are not governed by this scope selector.

The adjustment sheet closes after **Apply changes**, updates the parent summary, and leaves **Plan my week** as the explicit generation action.

## Consequences

- Add a narrow authenticated planning-preferences contract with one record per owner.
- Do not turn Clerk-synchronised identity fields into a generic settings document.
- A plan-generation command resolves values in this order: temporary override, saved usual preference, Foodedo default.
- Start dates remain explicit plan-specific input.
- Guest defaults remain local and do not create backend users or preferences.
- Preference mutations need patch semantics so unchanged fields are not overwritten.
- Tests must cover temporary overrides, future-default updates, unchanged values, and start-date non-persistence.
