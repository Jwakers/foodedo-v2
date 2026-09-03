# Shopping List MVP

Status: **approved and frozen for implementation**.

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

## Plan synchronisation

- Changes to the active plan update the derived Shopping List automatically.
- Preserve checked state for ingredients that still exist after an update wherever logically possible.
- `Shopping list updated` feedback is temporary contextual feedback, not permanent page content.
- Once temporary feedback clears, restore the standard Shopping header and list state.

## Discovery contract

- The first successfully saved plan teaches Shopping once through the approved `Your week is sorted` success state.
- Future plan saves return directly to the canonical active-plan experience. At most, show a short-lived confirmation.
- The permanent Home entry is `Shopping list ready`, `18 items · from 7 planned meals`, and `View list`.
- Use `View list` consistently for the Home Shopping action.

## MVP boundary

Do not add manual items or quantities, custom categories, multiple lists, pantry inventory, sharing, aisle configuration, barcode scanning, or manual category management.

Any expansion of this boundary requires a new product and architecture decision. It must not be inferred from the current implementation or older Foodedo versions.
