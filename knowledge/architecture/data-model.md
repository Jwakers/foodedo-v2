# V2 data model

Partially implemented. `users`, private `recipes`, `mealPlans`, `mealSlots`, `shoppingLists`, `shoppingListItems`, and `guestClaims` are the current foundation; the remaining entities below are proposed. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays are reserved for small bounded content.

Orient around jobs, not V1 tables.

Guest access does not create backend documents. Its bounded, versioned draft lives locally until an authenticated user explicitly keeps it. See [identity-and-guest.md](./identity-and-guest.md).

## Core entities

### users

Account record synchronised from Clerk webhooks. The Clerk JWT subject is stored as the unguessable `authSubject`, with only the identity fields Foodedo currently needs: nullable email and name plus Clerk creation/update timestamps. Product preferences are kept in purpose-specific authenticated records rather than turning this Clerk-synchronised row into a generic settings document.

There are no anonymous/guest `users` rows. A verified Clerk webhook creates or updates the profile record. Personal Convex functions resolve the verified `ctx.auth` subject through `by_auth_subject`, use the resulting `users` document ID for internal ownership, and never accept an owner ID from the client. Until the webhook-created row exists, personal operations return an account-not-synchronised error.

**Index:** `by_auth_subject`.

**Deferred:** subscription fields, super-user flags, household membership.

### planningPreferences

The small set of reusable defaults required by the approved signed-in **Adjust your plan** MVP.

- `ownerId`
- `usualPlanDays`: `3` | `5` | `7`
- `usualServings`
- `prioritiseSavedRecipes`
- `createdAt`, `updatedAt`

**Index:** unique-by-contract `by_owner`.

There is at most one record per authenticated owner. Mutations derive the owner from `ctx.auth`, use patch semantics, and update only persistent-capable fields the user actually changed. The actual start date selected for a plan is never stored here.

The pre-plan sheet resolves its initial values from this record and then Foodedo defaults. **This plan only** keeps overrides in local generation state. **This and future plans** also patches this record. Dietary requirements and allergies will use their own later profile contract and are not governed by this selector. See [ADR 0009](../decisions/0009-plan-adjustments-and-preferences.md).

### catalogue meals (standard content)

Foodedo's standard meal catalogue is product content, not user-owned data. Guests and account holders receive the same current set of published meal revisions through unauthenticated Convex queries.

`catalogueMeals` stores a stable catalogue identity, positive per-meal version, status (`staging`, `published`, or `retired`), unique current slug, deterministic current position, validated recipe content, publication timestamps, and an optional typed Convex storage image ID. Exactly one revision per stable meal may be published. Published and retired revisions are immutable/readable; staging revisions are not public. Status/order, meal-ID/version, meal-ID/status, and status/slug indexes support current and exact-revision reads. Saving copies a trusted published or retired revision into a private recipe snapshot. There is no catalogue-wide release entity.

An early catalogue can be small because the product is early. Do not model a separate guest subset or use authentication to gate standard meals.

Premium meals and subscription entitlements are deferred. When implemented, premium content must be delivered only after server-side authentication and entitlement checks; do not rely on a client-only visibility flag.

### recipes (private snapshots)

The private Capture unit: something an account wants to cook. `ownerId` is a typed `users` document ID resolved server-side from the verified Clerk identity; it is never accepted from a client.

Recipe content contains title, optional description, bounded ingredient lines and steps, optional servings/times, provenance, `savedAt?`, and `updatedAt`. The MVP enrichment slice adds a required `proteinCategory` (`chicken` | `beef` | `pork` | `lamb` | `fish` | `meat-free`), optional `costBand` (`budget` | `standard` | `premium`), explicit oven preheat, and authored step-timer cues. Every newly authored ingredient line also requires one narrow `shoppingCategory` (`fruit_and_veg` | `meat_and_fish` | `dairy_and_eggs` | `pantry` | `bakery`) so Shopping can group new recipes without maintaining name allowlists. Ingredient, step, and timer-cue IDs remain stable inside the recipe. Human-readable ingredient quantity is preserved as text rather than forced into a numeric amount.

`savedAt` is explicit library membership. Manual creation sets it immediately; choosing **Save recipe** sets it on a catalogue snapshot. A meal plan may create the same private snapshot solely to preserve what was planned without adding it to **My recipes**. Removing a recipe from the library clears `savedAt` rather than deleting a snapshot still referenced by a plan.

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_saved_at`, and `by_owner_and_catalogue_source`. The saved index paginates explicit library membership; the source index supports both stable-identity saved-state lookup and exact-revision idempotency without scanning a user's recipe library.

Catalogue, personal, and future published recipes remain distinct. Saving shared content produces an attributed personal snapshot rather than a live mutable reference. See [recipes-and-ingredients.md](./recipes-and-ingredients.md).

**Deferred vs V1:** canonical ingredient identity and synonym merging, broader ingredient or nutritional taxonomies beyond the five shopping groups, cuisine unions, generator flags, manual image upload, search, import, publishers, social relationships, editorial descriptor taxonomy, and automatic method-step ingredient mapping.

### mealPlans

The durable identity of a plan. Foodedo normally plans around seven days, but the plan is not forced to be an exact calendar week.

- `ownerId`
- `startDate`, `endDate` (`YYYY-MM-DD`)
- `servings` used by this plan's Cook and Shop views
- `status`: `active` | `archived`
- `createdAt`, `updatedAt`

**Indexes:** `by_owner_and_updated_at`, `by_owner_and_status_and_updated_at`

Keep this parent intentionally small. Days are represented by its range/slots and the actual start date already belongs to the plan. Persist serving count because downstream Cook and Shop need it. Generation seeds, saved-recipe strategy, preference copies, leftover snapshots, and other V1-style metadata do not belong here without another demonstrated product need.

Authenticated clients hydrate the current active plan from this table and its indexed slots. Local guest completion state is never used as the cross-device source of truth.

An account should have one active plan. An alternative is a deterministic, read-only proposal rather than a stored draft. Applying it verifies the source plan ID and `updatedAt`, preserves elapsed slots, archives the current parent, and creates the replacement atomically. Plan choices are source-neutral recipe references: existing personal recipes are reused by ID, while standard catalogue choices are materialised as private snapshots only when applied. The archived parent supports immediate undo and later history.

An accepted guest draft is also an explicit replacement intent: claiming it
archives a different active parent and creates the exact seven-day reviewed plan
atomically. Week exposes a bounded list of recent plans with archived entries in a
view-only state, so replacing a nearly elapsed plan does not erase its history.

A pre-save plan shorter than seven days may be extended from its review screen
one day at a time. Extension preserves every existing choice and intentional gap,
then chooses one non-duplicate meal for the newly created trailing date. Four-
and six-day plans are valid draft and saved-plan states, but the reusable
`usualPlanDays` preference remains constrained to the deliberate 3, 5, or 7-day
setup choices. A saved active week remains read-only; structural changes there
continue to use **Adjust plan**.

Convex transactions prevent ordinary mutations from creating multiple active plans. If historical, imported, or manually edited data violates that invariant, the app continues showing the most recently updated plan and blocks further plan edits. One explicit recovery mutation keeps that plan and archives the other active parents atomically; merely reading the plan never repairs data silently.

### mealSlots

The independently editable meals belonging to a plan. Separate slots keep individual dates and recipe references indexable without making the plan itself an inferred collection of adjacent rows or an increasingly large embedded array.

- `mealPlanId`
- `ownerId`
- `date` (local calendar date as `YYYY-MM-DD`)
- `recipeId`
- `status`: `planned` | `cooked` | `skipped`
- `createdAt`, `updatedAt`

**Indexes:** `by_plan_and_date`, `by_owner_and_date`, `by_recipe`

Recipe deletion must either be refused while slots reference the recipe or update/delete those slots in the same mutation. Account deletion removes slots before recipes. Plan reads preserve the plan and mark an unexpectedly dangling recipe unavailable rather than failing the entire application.

### shoppingLists / shoppingListItems

An authenticated shopping list is the editable shopping companion for exactly one meal plan. Each plan has at most one list, and the active plan's list is the default Shop view.

- List: `ownerId`, `mealPlanId`, `mealPlanUpdatedAt`, `status` (`active` | `archived`), timestamps
- Item: `shoppingListId`, `ownerId`, `name`, optional `displayName`, optional `category` constrained to `fruit_and_veg` | `meat_and_fish` | `dairy_and_eggs` | `pantry` | `bakery` (derived ingredients store the authored category; reads may default missing legacy values to `pantry`), bounded source detail lines and recipe IDs, optional per-occurrence `sources`, `origin` (`derived` | `manual`), `checked`, optional `deletedAt`, `order`, timestamps

**Indexes:** lists by owner/status/update and meal plan; items by list/order and owner/update.

Derivation groups normalised exact ingredient names within the same shopping category. It keeps each recipe's authored quantity, unit, and note as a readable source line instead of inventing totals or conversions. Manual additions and checks live on the linked list. Removing an item sets `deletedAt`; it remains in a small **Removed items** section until restored or the parent list expires.

The list records its plan's `updatedAt`. Plan creation creates the linked list in the same transaction; any later meal change reconciles that same list transactionally. An exact-name derived ingredient that still exists preserves its checked and removed state, a newly required ingredient starts unchecked, and an obsolete derived ingredient is removed. Manual items are untouched. Activating a replacement plan therefore switches Shop to that plan's own list rather than rebuilding or repurposing another list.

Shopping history follows the same bounded-summary pattern as meal-plan history: load a small set of recent linked-list metadata first, then hydrate one selected list. The list date acts as the progressive-disclosure trigger, and selection is represented in the Shop URL so browser back and refresh preserve context. Previous-plan lists remain editable for delayed shopping.

The list follows its meal plan's lifetime. Account deletion removes list items before lists, and a future explicit plan-deletion flow must do the same; there is no independent list inactivity expiry that can break the relationship.

**Deferred vs V1:** leftover include modes, chalkboard linkage, household privacy, serving-scale metadata forests. Add scaling when Cook/Shop prove it.

### recipeEvents (Remember)

Signals so Decide can surface neglected food.

- `ownerId`, `recipeId`
- `type`: `saved` | `cooked` | `suggested` | `dismissed`
- `at`

**Indexes:** `by_owner_and_recipe`, `by_owner_and_at`, `by_recipe_and_at`

Last cooked = latest `cooked` event. Neglect = saved/cooked gap. Do not start with V1 `recipeBehaviourStats` suggested/swapped/removed counters unless Decide needs them.

### guestClaims

Idempotency records for moving a local guest draft into an authenticated account.

- `ownerId`
- `claimKey` (random client-generated key, validated and bounded)
- `mealPlanId`
- `claimedAt`

**Index:** `by_owner_and_claim_key`

The claim mutation resolves `ownerId` from the verified `ctx.auth` subject and the indexed `users` row, checks this index before writing, validates the complete reviewed payload, copies referenced standard catalogue meals, and creates one plan with its meal slots. It records the resulting plan ID in the same atomic mutation. Repeating a claim returns its original plan. A different active plan is archived in the same transaction before the reviewed draft becomes active; archived history does not block the claim. No guest payload is trusted as an owner reference.

## Relationships (summary)

```
authenticated identity 1—1 users
users 1—* recipes
users 1—0..1 planningPreferences
users 1—* mealPlans 1—* mealSlots *—1 recipes
users 1—* shoppingLists 1—* shoppingListItems
users 1—* recipeEvents *—1 recipes
users 1—* guestClaims
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
