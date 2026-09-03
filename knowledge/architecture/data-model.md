# V2 data model

Partially implemented. `users`, private `recipes`, `mealPlans`, `mealSlots`, `shoppingLists`, `shoppingListItems`, and `guestClaims` are the current foundation; the remaining entities below are proposed. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays are reserved for small bounded content.

Orient around jobs, not V1 tables.

Guest access does not create backend documents. Its bounded, versioned draft lives locally until an authenticated user explicitly keeps it. See [identity-and-guest.md](./identity-and-guest.md).

## Core entities

### users

Account record synchronised from Clerk webhooks. The Clerk JWT subject is stored as the unguessable `authSubject`, with only the identity fields Foodedo currently needs: nullable email and name plus Clerk creation/update timestamps. Product preferences are kept in purpose-specific authenticated records rather than turning this Clerk-synchronised row into a generic settings document.

There are no anonymous/guest `users` rows. A verified Clerk webhook creates or updates the profile record; personal Convex functions independently derive the caller from verified `ctx.auth` identity and never accept an owner ID from the client.

**Index:** `by_auth_subject`.

**Deferred:** subscription fields, super-user flags, household membership.

### planningPreferences

The small set of reusable defaults required by the approved signed-in **Adjust your plan** MVP.

- `ownerSubject`
- `usualPlanDays`: `3` | `5` | `7`
- `usualServings`
- `prioritiseSavedRecipes`
- `createdAt`, `updatedAt`

**Index:** unique-by-contract `by_owner`.

There is at most one record per authenticated owner. Mutations derive the owner from `ctx.auth`, use patch semantics, and update only persistent-capable fields the user actually changed. The actual start date selected for a plan is never stored here.

The pre-plan sheet resolves its initial values from this record and then Foodedo defaults. **This plan only** keeps overrides in local generation state. **This and future plans** also patches this record. Dietary requirements and allergies will use their own later profile contract and are not governed by this selector. See [ADR 0009](../decisions/0009-plan-adjustments-and-preferences.md).

### catalogue meals (standard content)

Foodedo's standard meal catalogue is product content, not user-owned data. Guests and account holders receive the same complete standard catalogue for a given release. It is currently a versioned bundle with stable catalogue IDs; the 23 lightweight entries support plan testing and are not the final authored catalogue.

Move catalogue content to explicit public, non-personal Convex reads before introducing generation, administration, frequent independent updates, or substantial catalogue growth. Persist authoring candidates separately from immutable published revisions: generation creates a draft, validation and review promote it, and only published standard revisions are returned to guests. Saving continues to copy the trusted published revision into a private recipe snapshot.

An early catalogue can be small because the product is early. Do not model a separate guest subset or use authentication to gate standard meals.

Premium meals and subscription entitlements are deferred. When implemented, premium content must be delivered only after server-side authentication and entitlement checks; do not rely on a client-only visibility flag.

### recipes (private snapshots)

The private Capture unit: something an account wants to cook. `ownerSubject` is always derived from the verified Clerk identity; it is never accepted from a client and does not depend on webhook timing.

Recipe content contains title, optional description, bounded ingredient lines and steps, optional servings/times, provenance, `savedAt?`, and `updatedAt`. The MVP enrichment slice adds `proteinCategory`, `costBand`, explicit oven preheat, and authored step-timer cues. Ingredient, step, and timer-cue IDs remain stable inside the recipe. Human-readable ingredient quantity is preserved as text rather than forced into a numeric amount.

`savedAt` is explicit library membership. Manual creation sets it immediately; choosing **Save recipe** sets it on a catalogue snapshot. A meal plan may create the same private snapshot solely to preserve what was planned without adding it to **My recipes**. Removing a recipe from the library clears `savedAt` rather than deleting a snapshot still referenced by a plan.

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_saved_at`, `by_owner_and_catalogue_source`, and `by_owner_and_catalogue_version`. The saved index paginates explicit library membership; the source index makes one meal revision idempotent; the version index hydrates saved state for the visible catalogue without scanning a user's recipe library.

Catalogue, personal, and future published recipes remain distinct. Saving shared content produces an attributed personal snapshot rather than a live mutable reference. See [recipes-and-ingredients.md](./recipes-and-ingredients.md).

**Deferred vs V1:** canonical ingredients, broad categories, cuisine unions, generator flags, images, search, import, public slugs, publishers, social relationships, editorial descriptor taxonomy, and automatic method-step ingredient mapping.

### mealPlans

The durable identity of a plan. Foodedo normally plans around seven days, but the plan is not forced to be an exact calendar week.

- `ownerSubject`
- `startDate`, `endDate` (`YYYY-MM-DD`)
- `servings` used by this plan's Cook and Shop views
- `status`: `active` | `archived`
- `createdAt`, `updatedAt`

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_status_and_updated_at`

Keep this parent intentionally small. Days are represented by its range/slots and the actual start date already belongs to the plan. Persist serving count because downstream Cook and Shop need it. Generation seeds, saved-recipe strategy, preference copies, leftover snapshots, and other V1-style metadata do not belong here without another demonstrated product need.

Authenticated clients hydrate the current active plan from this table and its indexed slots. Local guest completion state is never used as the cross-device source of truth.

An account should have one active plan. An alternative is a deterministic, read-only proposal rather than a stored draft. Applying it verifies the source plan ID and `updatedAt`, preserves elapsed slots, archives the current parent, and creates the replacement atomically. Plan choices are source-neutral recipe references: existing personal recipes are reused by ID, while standard catalogue choices are materialised as private snapshots only when applied. The archived parent supports immediate undo and later history.

Convex transactions prevent ordinary mutations from creating multiple active plans. If historical, imported, or manually edited data violates that invariant, the app continues showing the most recently updated plan and blocks further plan edits. One explicit recovery mutation keeps that plan and archives the other active parents atomically; merely reading the plan never repairs data silently.

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

An authenticated shopping list is an editable snapshot derived from one active meal-plan revision.

- List: `ownerSubject`, `mealPlanId`, `mealPlanUpdatedAt`, `status` (`active` | `archived`), timestamps
- Item: `shoppingListId`, `ownerSubject`, `name`, bounded source detail lines and recipe IDs, `origin` (`derived` | `manual`), `checked`, optional `deletedAt`, `order`, timestamps

**Indexes:** lists by owner/status/update and meal plan; items by list/order and owner/update.

Generation groups only normalised exact ingredient names. It keeps each recipe's authored quantity, unit, and note as a readable source line instead of inventing totals or conversions. Manual additions and checks live on the derived snapshot. Removing an item sets `deletedAt`; it remains in a small **Removed items** section until restored or the parent list expires.

The list records the source plan's `updatedAt`. A later meal swap or plan replacement makes the list visibly out of date but never rewrites it. Explicit regeneration archives every older active list and creates a fresh snapshot atomically. This protects manual edits while retaining a simple one-current-list model.

Retention has two bounds: keep at most 30 list snapshots per account, and delete any list after 30 days without list activity. A daily internal Convex job removes expired items in bounded batches before deleting each parent. Checking, adding, removing, or restoring an item refreshes the parent activity timestamp.

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

The claim mutation derives `ownerSubject` from `ctx.auth`, checks this index before writing, validates the complete seven-day payload, copies referenced standard catalogue meals, and creates one plan with its meal slots. It records the resulting plan ID in the same atomic mutation. Repeating a claim returns its original plan; an existing active plan produces a typed conflict and nothing is overwritten. Archived history does not block a new active plan. No guest payload is trusted as an owner reference.

## Relationships (summary)

```
authenticated identity 1—* recipes
authenticated identity 1—0..1 planningPreferences
authenticated identity 1—* mealPlans 1—* mealSlots *—1 recipes
authenticated identity 1—* shoppingLists 1—* shoppingListItems
authenticated identity 1—* recipeEvents *—1 recipes
authenticated identity 1—* guestClaims
```

Cook is **not** a table. It is a cooking-mode view of `recipes`.

An active Cook session—current step, preparation checks, scroll position, and running timers—is runtime/local recovery state, not durable recipe content and not a Convex table in the MVP.

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
