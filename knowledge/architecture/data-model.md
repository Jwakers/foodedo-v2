# V2 data model (proposed)

Not implemented. There is no `convex/schema.ts` yet. Documents stay **flat and relational** (IDs, indexes on foreign keys). Arrays only for small bounded lists.

Orient around jobs, not V1 tables.

## Core entities

### users

Account record once auth exists. Identity provider subject stored as an unguessable external id. Preferences as a small nested object (allergies, excluded proteins, default servings) — not a configuration product.

**Indexes:** `by_externalId`

**Deferred:** subscription fields, super-user flags, household membership.

### recipes (saved dishes)

The Capture unit: something the user wants to cook.

- `userId`
- `title`
- `sourceUrl` / `sourceType` (`import` | `share` | `manual` | `photo` — extend later)
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

## Relationships (summary)

```
users 1—* recipes
users 1—* mealSlots *—1 recipes
users 1—* shoppingLists 1—* shoppingListItems
users 1—* recipeEvents *—1 recipes
```

Cook is **not** a table. It is a cooking-mode view of `recipes`.

## Explicitly deferred

| V1 concept                        | V2 stance                                             |
| --------------------------------- | ----------------------------------------------------- |
| households, members, invites      | Premium-later                                         |
| chalkboardItems                   | Not first-class; only if Shop needs a quick add-inbox |
| ingredients catalog + food groups | Later, if merge quality requires it                   |
| public recipes / CMS / slugs      | Out of personal engine                                |
| mealPlans generation metadata     | Don't migrate as a product surface                    |
| subscriptions / ads               | Not initial build                                     |
| Discover feed                     | Emerges from Remember + context                       |

## Indexes reminder

Always index `userId` and join keys. Prefer `withIndex` over `filter`. Paginate unbounded lists (recipe library, events).
