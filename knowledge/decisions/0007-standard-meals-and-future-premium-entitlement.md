# 0007 — Standard meals and future premium entitlement

## Status

Accepted

## Context

“Starter dish” is ambiguous in ordinary food language, where a starter is a course before the main meal. It also suggests that guests receive an entry-level or deliberately reduced meal set. That would confuse the product language and make authentication an artificial content gate instead of the boundary for preserving personal work.

Foodedo may later offer paid meal content, but monetisation is not part of the foundation or the first identity slice.

## Decision

- Use **standard meal catalogue** and the domain name `CatalogueMeal`; do not use “starter dish” for guest-accessible product content.
- Guests and account holders can access the same complete standard Foodedo meal catalogue for a given release.
- The initial catalogue may be small or bundled because of product maturity and delivery simplicity, never because it is a guest tier.
- Authentication is required for durable personal data such as saved plans, recipes, preferences, and history—not for standard catalogue meals.
- Explicitly premium meals or collections may be introduced later. They require both an authenticated account and an active subscription entitlement verified on the server.
- Standard meals must not be relabelled, removed, or migrated behind the premium boundary to manufacture scarcity.
- Do not implement subscription models, entitlement services, paywalls, or premium delivery in the foundation.

## Consequences

- Product language matches normal culinary usage and no longer implies a first-course dish or demo catalogue.
- Guest activation demonstrates the real standard content experience rather than a restricted teaser.
- A small early catalogue is still acceptable, but catalogue completeness is identical across guest and authenticated access states.
- Future premium content needs a distinct delivery and authorization design; a client-side hidden flag is insufficient.
- Public standard-catalogue reads can remain bounded and non-personal, while all personal persistence and future premium reads retain explicit authorization boundaries.
