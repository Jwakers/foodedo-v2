# Features

Feature modules map to jobs, not screens:

- `capture/`
- `decide/`
- `plan/`
- `shop/`
- `cook/`
- `remember/`

Route screens may compose several jobs: the recipe library uses Capture for explicit saves and Cook for the readable recipe view. Keep UI, hooks, and feature-specific helpers together. Put reusable domain logic in `src/lib/domain`.
