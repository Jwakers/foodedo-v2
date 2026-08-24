# V2 data model (proposed)

Not implemented. There is no `convex/schema.ts` yet. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays only for small bounded lists.

Orient around jobs, not V1 tables.

Guest access does not create backend documents. Its bounded, versioned draft lives locally until an authenticated user explicitly keeps it. See [identity-and-guest.md](./identity-and-guest.md).

## Core entities

### users

Account record once auth exists. Identity provider subject stored as an unguessable `authSubject`; if the selected integration already owns the canonical Convex user table, reference that identity rather than duplicating it. Preferences are a small nested object (allergies, excluded proteins, default servings) — not a configuration product.

There are no anonymous/guest `users` rows. Create this record only from verified `ctx.auth` identity.

**Index:** `by_auth_subject` when Foodedo owns the user mapping.

**Deferred:** subscription fields, super-user flags, household membership.

### catalogue meals (standard content)

Foodedo's standard meal catalogue is product content, not user-owned data. Guests and account holders receive the same complete standard catalogue for a given release. The initial implementation may be a versioned bundle with stable catalogue IDs; move it to explicit public, non-personal backend reads only when scale or update frequency requires that.

An early catalogue can be small because the product is early. Do not model a separate guest subset or use authentication to gate standard meals.

Premium meals and subscription entitlements are deferred. When implemented, premium content must be delivered only after server-side authentication and entitlement checks; do not rely on a client-only visibility flag.

### recipes (saved dishes)

The Capture unit: something the user wants to cook.

- `userId`
- `title`
- `sourceUrl` / `sourceType` (`catalogue` | `import` | `share` | `manual` | `photo` — extend later)
- `ingredients`: small array of `{ name, amount?, unit?, note? }` until we prove a catalog is needed
- `steps`: array of `{ text }`
- `serves?`, `prepMinutes?`, `cookMinutes?`, `imageStorageId?`
- `createdAt`, `updatedAt`

**Indexes:** `by_user`, `by_user_and_updatedAt`

**Deferred vs V1:** categories, cuisine unions, complexity tiers, generator flags, public slugs, search indexes, hero-image origin enums, nested method/ingredient ref graphs. Add search when Decide needs it.

A global ingredients catalog is **not** a V2 day-one requirement. Parse names on the recipe; introduce canonical ingredients when Shop merge quality demands it.

### mealSlots (short-horizon plan)

Plan is a few days of decided eats, not a generated week object with seed/version/leftover snapshots.

- `userId`
- `date` (start of local day as a number the client passes in; queries must not use `Date.now()`)
- `recipeId`
- `order?`
- `status`: `planned` | `cooked` | `skipped`

**Indexes:** `by_user_and_date`, `by_recipe`

### shoppingLists / shoppingListItems

Derived from decided meals, then editable.

- List: `userId`, `status` (`active` | `completed`), `createdAt`
- Item: `shoppingListId`, `name`, `amount?`, `unit?`, `checked`, `order`, optional `recipeId`

**Indexes:** `by_user_and_status`, `by_shopping_list`

**Deferred vs V1:** leftover include modes, chalkboard linkage, household privacy, serving-scale metadata forests. Add scaling when Cook/Shop prove it.

### recipeEvents (Remember)

Signals so Decide can surface neglected food.

- `userId`, `recipeId`
- `type`: `saved` | `cooked` | `suggested` | `dismissed`
- `at`

**Indexes:** `by_user_and_recipe`, `by_user_and_at`, `by_recipe_and_at`

Last cooked = latest `cooked` event. Neglect = saved/cooked gap. Do not start with V1 `recipeBehaviourStats` suggested/swapped/removed counters unless Decide needs them.

### guestClaims

Idempotency records for moving a local guest draft into an authenticated account.

- `userId`
- `claimKey` (random client-generated key, validated and bounded)
- `claimedAt`

**Index:** `by_user_and_claim_key`

The claim mutation derives `userId` from `ctx.auth`, checks this index before writing, validates the complete bounded payload, copies referenced standard catalogue meals, and creates the user's plan/preferences. It records the claim in the same mutation. No guest payload is trusted as an owner reference.

## Relationships (summary)

```
users 1—* recipes
users 1—* mealSlots *—1 recipes
users 1—* shoppingLists 1—* shoppingListItems
users 1—* recipeEvents *—1 recipes
users 1—* guestClaims
```

Cook is **not** a table. It is a cooking-mode view of `recipes`.

## Explicitly deferred

| V1 concept                        | V2 stance                                             |
| --------------------------------- | ----------------------------------------------------- |
| households, members, invites      | Premium-later                                         |
| chalkboardItems                   | Not first-class; only if Shop needs a quick add-inbox |
| ingredients catalog + food groups | Later, if merge quality requires it                   |
| public user recipes / CMS / slugs | Out of personal engine                                |
| mealPlans generation metadata     | Don't migrate as a product surface                    |
| premium meals / subscriptions     | Later; authenticated, server-verified entitlement     |
| ads                               | Not initial build                                     |
| Discover feed                     | Emerges from Remember + context                       |
| anonymous backend users           | No; guest drafts remain device-local                  |

## Indexes reminder

Always index `userId` and join keys. Prefer `withIndex` over `filter`. Paginate unbounded lists (recipe library, events).
