# Shopping List MVP

Status: **implemented from the approved Paper flow**.

Every saved meal plan owns one Shopping List. The active plan's list is the default; previous plans keep their linked lists so delayed shopping remains possible. A list is not a second source of truth and cannot be created independently from a plan, but it can carry checks and small manual adjustments.

```text
active meal plan
→ recipes and servings
→ canonical required ingredients
→ safe consolidation and supermarket categories
→ shopping list
```

## Interaction contract

- The checkbox and ingredient label form one large purchased-state target that remains comfortably usable one-handed.
- The trailing chevron is a separate, labelled details action that opens the ingredient's `Used for` provenance sheet. Each meal in that sheet links through to its recipe.
- Completion and provenance must remain separate controls within the row.
- Checked items remain in their current category and position unless the user explicitly hides them.
- `Hide checked` appears after at least one item is checked. While checked items are hidden, the control becomes `Show checked (N)`, where `N` is the number hidden.
- Hiding checked items is reversible display state. It never deletes them or changes their purchased state.
- Shopping progress and checked state survive normal navigation.
- Checks, removals, and restores use Convex `withOptimisticUpdate` against the subscribed query caches; do not mirror server items in component state.
- Closing ingredient provenance returns to the exact prior Shopping List scroll position.
- A completed list remains visible, reviewable, and reversible. Use one restrained completion message with lightweight progress information.
- When previous plan lists exist, the date line is a compact history trigger. It opens a bottom sheet rather than hiding navigation in an ellipsis action menu.
- Selecting a previous list updates the URL, and that linked list remains fully editable so delayed shopping still works.
- Previous lists clearly identify themselves and provide a direct return to the current plan's list.

## Plan changes

- A Shopping List has a one-to-one lifecycle relationship with its meal plan.
- Saving a plan creates its list in the same transaction. Opening Shop defensively creates a missing legacy list if needed.
- Changes to a plan reconcile its existing list automatically: retained exact-name ingredients preserve their checked and removed state, obsolete derived ingredients disappear, and new ingredients arrive unchecked.
- Manual items are never changed by plan reconciliation. Ingredient-name canonicalisation remains deliberately deferred.

## Household staples

- Shopping treatment is separate from supermarket category. Derived
  ingredients are `required`, a `staple`, or omitted from Shopping.
- Generic preparation water is omitted. Specifically named products such as
  sparkling, bottled, filtered, mineral, or distilled water remain required.
- The initial staple set is deliberately narrow: salt, black/white pepper,
  and common neutral or olive cooking oils. Distinctive oils remain required.
- Unselected staples appear after the main aisles in **Check your cupboards**.
  They do not contribute to item counts or progress.
- Adding a staple applies only to that list and moves it into its authored
  supermarket category. Removing it returns it to the cupboard section.
- Manual additions are always required. No pantry inventory, global setting,
  or cross-list learning is implied by this feature.

## Discovery contract

- A successful save uses the existing confirmation route to confirm that the plan is durable. The first successful save introduces the generated shopping list with “Open shopping list”; later saves use a brief confirmation and ordinary Week/Shopping actions.
- Home describes Shopping as ready and uses the permanent `View list` action.
- Use `View list` consistently after that action is available.

## MVP boundary

Do not add custom categories, pantry inventory, sharing, aisle configuration,
barcode scanning, or manual category management.

A linked list follows its meal plan's lifetime; it is deleted with the owning account or a future explicit plan-deletion flow, not by an independent inactivity timer.

Any expansion of this boundary requires a new product and architecture decision. It must not be inferred from the current implementation or older Foodedo versions.

## Serving minimums

Keep the plan's household count separate from each recipe's cooking quantity. A two-person plan with a minimum-four lasagna buys four portions of lasagna ingredients, while ordinary meals still buy two. Resolve through the shared recipe serving model before grouping; do not independently multiply by household servings. Respect `source_only` and missing-yield recipes. Repeated meal occurrences remain separate sources. “Used for” quantities and links carry the plan's requested servings so Detail/Cook explain the same quantities. Existing reconciliation preserves checks, removals, staples and extras. Leftovers are not credited against another meal automatically.

Owner corrections to imported recipes reconcile every linked shopping list transactionally, including archived lists retained for delayed shopping. Temporary changes to servings in Detail/Cook do not mutate the stored recipe or its lists.
