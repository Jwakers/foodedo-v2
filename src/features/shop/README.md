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
- The trailing chevron is a separate, labelled details action that opens the ingredient's `Used for` provenance sheet.
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

## Discovery contract

- A successful save may use the dedicated `Your week is sorted` route to confirm that the plan is durable.
- Home and successful plan-save surfaces describe Shopping as ready and use the permanent `View list` action.
- Use `View list` consistently after that action is available.

## MVP boundary

Do not add custom categories, pantry inventory, sharing, aisle configuration, barcode scanning, or manual category management.

A linked list follows its meal plan's lifetime; it is deleted with the owning account or a future explicit plan-deletion flow, not by an independent inactivity timer.

Any expansion of this boundary requires a new product and architecture decision. It must not be inferred from the current implementation or older Foodedo versions.
