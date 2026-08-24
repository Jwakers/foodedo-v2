# 0006 — Guest-first account boundary

## Status

Accepted

## Context

Requiring sign-in before Foodedo demonstrates its decision loop conflicts with “feel useful immediately” and creates an avoidable adoption barrier. Creating anonymous backend users would make guest data look durable, create abandoned records, complicate retention, and influence the authentication-provider decision prematurely.

## Decision

- Visitors can try a bounded Decide → Plan → Shop flow using the same complete standard meal catalogue available to account holders. The initial catalogue may be small and bundled, but it is not a restricted guest subset.
- Guest state is temporary, versioned, device-local, and clearable. It is not stored in Convex and does not create a user.
- Sign-in is requested at the value boundary: keeping a plan, saving/importing personal recipes, retaining settings/history, or syncing.
- After authentication, one validated, idempotent claim mutation moves the guest draft into user-owned Convex documents.
- Guest access remains independent of the eventual auth provider.

## Consequences

- The product can prove value before requesting identity.
- The standard catalogue and guest draft schema become foundational, versioned contracts.
- The UI must distinguish “temporary on this device” from “saved to your account.”
- Persistent personal Convex reads and writes remain authenticated; guest mode does not weaken authorization.
- Guest claim, retry, merge, and cleanup paths require E2E coverage.
- This activation path is not the later Discover feed.
- Authentication protects persistence, not access to standard Foodedo meals. Future premium meals are a separate subscription entitlement described in [ADR 0007](./0007-standard-meals-and-future-premium-entitlement.md).

Implementation details and provider evaluation criteria live in [identity-and-guest.md](../architecture/identity-and-guest.md).
