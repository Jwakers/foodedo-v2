# Shopping List MVP

Status: **approved for implementation; the current route remains a placeholder**.

The Shopping List is entirely derived from the user's active meal plan. It is not a second source of truth and does not support manual list creation or maintenance.

```text
active meal plan
→ recipes and servings
→ canonical required ingredients
→ safe consolidation and supermarket categories
→ shopping list
```

## Interaction contract

- The checkbox controls purchased state. Its touch target must remain comfortably usable one-handed.
- The ingredient content and trailing chevron open the ingredient's `Used for` provenance sheet. They do not toggle purchased state.
- Do not assign completion and provenance to the same row-level tap target.
- Checked items remain in their current category and position unless the user explicitly hides them.
- `Hide checked` appears after at least one item is checked. While checked items are hidden, the control becomes `Show checked (N)`, where `N` is the number hidden.
- Hiding checked items is reversible display state. It never deletes them or changes their purchased state.
- Shopping progress and checked state survive normal navigation.
- Closing ingredient provenance returns to the exact prior Shopping List scroll position.
- A completed list remains visible, reviewable, and reversible. Use one restrained completion message with lightweight progress information.

## Plan changes

- A Shopping List is a snapshot of the active plan revision used to create it.
- Changes to the active plan make an existing list visibly out of date; they do not silently overwrite checks or manual edits.
- Rebuilding is explicit. It archives the older list and creates a fresh list from the current plan.
- Do not promise automatic synchronisation until a later product and architecture decision defines safe checked-state reconciliation.

## Discovery contract

- A successful save may use the dedicated `Your week is sorted` route to confirm that the plan is durable.
- While Shopping remains a placeholder, success and Home copy must describe it as upcoming rather than ready or synced.
- Once the Shopping route is implemented, the permanent Home entry may become `Shopping list ready`, `18 items · from 7 planned meals`, and `View list`.
- Use `View list` consistently after that action is available.

## MVP boundary

Do not add manual items or quantities, custom categories, multiple lists, pantry inventory, sharing, aisle configuration, barcode scanning, or manual category management.

Any expansion of this boundary requires a new product and architecture decision. It must not be inferred from the current implementation or older Foodedo versions.
