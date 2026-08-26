# V2 data model

Partially implemented. `users` and private `recipes` are the current foundation; the remaining entities below are proposed. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays are reserved for small bounded recipe content.

Orient around jobs, not V1 tables.

Guest access does not create backend documents. Its bounded, versioned draft lives locally until an authenticated user explicitly keeps it. See [identity-and-guest.md](./identity-and-guest.md).

## Core entities

### users

Account record synchronised from Clerk webhooks. The Clerk JWT subject is stored as the unguessable `authSubject`, with only the profile fields Foodedo currently needs: nullable email and name plus Clerk creation/update timestamps. Preferences will be added only with the product slice that uses them—not as a configuration product.

There are no anonymous/guest `users` rows. A verified Clerk webhook creates or updates the profile record; personal Convex functions independently derive the caller from verified `ctx.auth` identity and never accept an owner ID from the client.

**Index:** `by_auth_subject`.

**Deferred:** subscription fields, super-user flags, household membership.

### catalogue meals (standard content)

Foodedo's standard meal catalogue is product content, not user-owned data. Guests and account holders receive the same complete standard catalogue for a given release. It is currently a small versioned bundle with stable catalogue IDs; move it to explicit public, non-personal backend reads only when scale or update frequency requires that.

An early catalogue can be small because the product is early. Do not model a separate guest subset or use authentication to gate standard meals.

Premium meals and subscription entitlements are deferred. When implemented, premium content must be delivered only after server-side authentication and entitlement checks; do not rely on a client-only visibility flag.

### recipes (saved dishes)

The private Capture unit: something an account wants to cook. `ownerSubject` is always derived from the verified Clerk identity; it is never accepted from a client and does not depend on webhook timing.

Recipe content contains title, optional description, bounded ingredient lines and steps, optional servings/times, provenance, and `updatedAt`. Ingredient and step IDs remain stable inside the recipe. Human-readable ingredient quantity is preserved as text rather than forced into a numeric amount.

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_catalogue_source`. The latter makes catalogue saving idempotent for an owner and catalogue revision.

Catalogue, personal, and future published recipes remain distinct. Saving shared content produces an attributed personal snapshot rather than a live mutable reference. See [recipes-and-ingredients.md](./recipes-and-ingredients.md).

**Deferred vs V1:** canonical ingredients, categories, cuisine unions, generator flags, images, search, import, public slugs, publishers, and social relationships.

### mealSlots (short-horizon plan)

Plan is a few days of decided eats, not a generated week object with seed/version/leftover snapshots.

- `ownerSubject`
- `date` (start of local day as a number the client passes in; queries must not use `Date.now()`)
- `recipeId`
- `order?`
- `status`: `planned` | `cooked` | `skipped`

**Indexes:** `by_owner_and_date`, `by_recipe`

### shoppingLists / shoppingListItems

Derived from decided meals, then editable.

- List: `ownerSubject`, `status` (`active` | `completed`), `createdAt`
- Item: `shoppingListId`, `name`, `amount?`, `unit?`, `checked`, `order`, optional `recipeId`

**Indexes:** `by_owner_and_status`, `by_shopping_list`

**Deferred vs V1:** leftover include modes, chalkboard linkage, household privacy, serving-scale metadata forests. Add scaling when Cook/Shop prove it.

### recipeEvents (Remember)

Signals so Decide can surface neglected food.

- `ownerSubject`, `recipeId`
- `type`: `saved` | `cooked` | `suggested` | `dismissed`
- `at`

**Indexes:** `by_owner_and_recipe`, `by_owner_and_at`, `by_recipe_and_at`

Last cooked = latest `cooked` event. Neglect = saved/cooked gap. Do not start with V1 `recipeBehaviourStats` suggested/swapped/removed counters unless Decide needs them.

### guestClaims

Idempotency records for moving a local guest draft into an authenticated account.

- `ownerSubject`
- `claimKey` (random client-generated key, validated and bounded)
- `claimedAt`

**Index:** `by_owner_and_claim_key`

The claim mutation derives `ownerSubject` from `ctx.auth`, checks this index before writing, validates the complete bounded payload, copies referenced standard catalogue meals, and creates the user's plan/preferences. It records the claim in the same mutation. No guest payload is trusted as an owner reference.

## Relationships (summary)

```
authenticated identity 1—* recipes
authenticated identity 1—* mealSlots *—1 recipes
authenticated identity 1—* shoppingLists 1—* shoppingListItems
authenticated identity 1—* recipeEvents *—1 recipes
authenticated identity 1—* guestClaims
```

Cook is **not** a table. It is a cooking-mode view of `recipes`.

## Explicitly deferred

| V1 concept                         | V2 stance                                             |
| ---------------------------------- | ----------------------------------------------------- |
| households, members, invites       | Premium-later                                         |
| chalkboardItems                    | Not first-class; only if Shop needs a quick add-inbox |
| ingredients catalog + food groups  | Later, if merge quality requires it                   |
| public recipes / publishers / feed | Later, separate from private recipe ownership         |
| mealPlans generation metadata      | Don't migrate as a product surface                    |
| premium meals / subscriptions      | Later; authenticated, server-verified entitlement     |
| ads                                | Not initial build                                     |
| Discover feed                      | Emerges from Remember + context                       |
| anonymous backend users            | No; guest drafts remain device-local                  |

## Indexes reminder

Always index owner and join keys. Prefer `withIndex` over `filter`. Paginate unbounded lists such as the recipe library and events.
