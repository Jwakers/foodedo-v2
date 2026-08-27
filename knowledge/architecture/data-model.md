# V2 data model

Partially implemented. `users`, private `recipes`, `mealPlans`, `mealSlots`, and `guestClaims` are the current foundation; the remaining entities below are proposed. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays are reserved for small bounded content.

Orient around jobs, not V1 tables.

Guest access does not create backend documents. Its bounded, versioned draft lives locally until an authenticated user explicitly keeps it. See [identity-and-guest.md](./identity-and-guest.md).

## Core entities

### users

Account record synchronised from Clerk webhooks. The Clerk JWT subject is stored as the unguessable `authSubject`, with only the profile fields Foodedo currently needs: nullable email and name plus Clerk creation/update timestamps. Preferences will be added only with the product slice that uses them—not as a configuration product.

There are no anonymous/guest `users` rows. A verified Clerk webhook creates or updates the profile record; personal Convex functions independently derive the caller from verified `ctx.auth` identity and never accept an owner ID from the client.

**Index:** `by_auth_subject`.

**Deferred:** subscription fields, super-user flags, household membership.

### catalogue meals (standard content)

Foodedo's standard meal catalogue is product content, not user-owned data. Guests and account holders receive the same complete standard catalogue for a given release. It is currently a small versioned bundle with stable catalogue IDs; this is a foundation-stage delivery choice rather than the final catalogue authoring architecture.

Move catalogue content to explicit public, non-personal Convex reads before introducing generation, administration, frequent independent updates, or substantial catalogue growth. Persist authoring candidates separately from immutable published revisions: generation creates a draft, validation and review promote it, and only published standard revisions are returned to guests. Saving continues to copy the trusted published revision into a private recipe snapshot.

An early catalogue can be small because the product is early. Do not model a separate guest subset or use authentication to gate standard meals.

Premium meals and subscription entitlements are deferred. When implemented, premium content must be delivered only after server-side authentication and entitlement checks; do not rely on a client-only visibility flag.

### recipes (private snapshots)

The private Capture unit: something an account wants to cook. `ownerSubject` is always derived from the verified Clerk identity; it is never accepted from a client and does not depend on webhook timing.

Recipe content contains title, optional description, bounded ingredient lines and steps, optional servings/times, provenance, `savedAt?`, and `updatedAt`. Ingredient and step IDs remain stable inside the recipe. Human-readable ingredient quantity is preserved as text rather than forced into a numeric amount.

`savedAt` is explicit library membership. Manual creation sets it immediately; choosing **Save recipe** sets it on a catalogue snapshot. A meal plan may create the same private snapshot solely to preserve what was planned without adding it to **My recipes**. Removing a recipe from the library clears `savedAt` rather than deleting a snapshot still referenced by a plan.

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_saved_at`, `by_owner_and_catalogue_source`, and `by_owner_and_catalogue_version`. The saved index paginates explicit library membership; the source index makes one meal revision idempotent; the version index hydrates saved state for the visible catalogue without scanning a user's recipe library.

Catalogue, personal, and future published recipes remain distinct. Saving shared content produces an attributed personal snapshot rather than a live mutable reference. See [recipes-and-ingredients.md](./recipes-and-ingredients.md).

**Deferred vs V1:** canonical ingredients, categories, cuisine unions, generator flags, images, search, import, public slugs, publishers, and social relationships.

### mealPlans

The durable identity of a plan. Foodedo normally plans around seven days, but the plan is not forced to be an exact calendar week.

- `ownerSubject`
- `startDate`, `endDate` (`YYYY-MM-DD`)
- `status`: `active` | `archived`
- `createdAt`, `updatedAt`

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_status_and_updated_at`

Keep this parent intentionally small. Generation seeds, leftover snapshots, settings copies, and other V1-style metadata require a demonstrated product need.

Authenticated clients hydrate the current active plan from this table and its indexed slots. Local guest completion state is never used as the cross-device source of truth.

### mealSlots

The independently editable meals belonging to a plan. Separate slots keep individual dates and recipe references indexable without making the plan itself an inferred collection of adjacent rows or an increasingly large embedded array.

- `mealPlanId`
- `ownerSubject`
- `date` (local calendar date as `YYYY-MM-DD`)
- `recipeId`
- `status`: `planned` | `cooked` | `skipped`
- `createdAt`, `updatedAt`

**Indexes:** `by_plan_and_date`, `by_owner_and_date`, `by_recipe`

Recipe deletion must either be refused while slots reference the recipe or update/delete those slots in the same mutation. Account deletion removes slots before recipes. Plan reads preserve the plan and mark an unexpectedly dangling recipe unavailable rather than failing the entire application.

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
- `mealPlanId`
- `claimedAt`

**Index:** `by_owner_and_claim_key`

The claim mutation derives `ownerSubject` from `ctx.auth`, checks this index before writing, validates the complete seven-day payload, copies referenced standard catalogue meals, and creates one plan with its meal slots. It records the resulting plan ID in the same atomic mutation. Repeating a claim returns its original plan; an occupied date produces a conflict and nothing is overwritten. No guest payload is trusted as an owner reference.

## Relationships (summary)

```
authenticated identity 1—* recipes
authenticated identity 1—* mealPlans 1—* mealSlots *—1 recipes
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
