# Design implementation plan

This plan turns the approved Foodedo V2 Paper frames into small vertical
slices. It complements the [design-to-scope register](./design-scope-register.md):
the register decides what belongs in the product; this document records a safe
implementation order. The previous feature UI was backend-test scaffolding and
is not an implementation reference.

## Delivery rules

- Build one complete user state or transition at a time.
- Preserve useful domain, persistence, identity, and route contracts without
  preserving their former UI.
- Compose shared page sections once. Authentication should add or remove the
  smallest relevant element instead of selecting a separate page tree.
- Add a shared primitive only after an approved frame proves the pattern repeats.
- Add backend fields immediately before the first vertical slice that consumes
  them. Do not front-load unrelated schema work.
- Verify every shared route in both the Vercel and Capacitor static-export builds.
- Treat loading, empty, error, guest, signed-in, and recovery states as part of
  each slice rather than later polish.

## Slice order

| Order | Slice                                 | Paper source                                              | Existing foundation                                      | Contract work before UI                                                      |
| ----- | ------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | Guest pre-plan                        | `01 / Pre-plan / Guest / Default`                         | Local guest draft, standard catalogue, Clerk entry point | None                                                                         |
| 2     | Guest plan review                     | `01 / Plan review / Guest / Default`, `Meal actions open` | Swap, shuffle, guest-draft persistence                   | None                                                                         |
| 3     | Guest keep-plan boundary              | Guest review and sign-in continuation states              | Idempotent guest claim and conflict recovery             | None                                                                         |
| 4     | Signed-in pre-plan and Adjust         | `02 / Pre-plan / Signed in / Default`, `02A / Adjust / …` | Authenticated plan reads                                 | Add `planningPreferences`, plan `servings`, query/patch operations           |
| 5     | Active-plan Home                      | `02 / Dashboard / Signed in / Active plan`                | Active-plan hydration, swaps, regeneration, undo         | Consume accepted plan facts; no generic dashboard schema                     |
| 6     | Shopping discovery and canonical list | `07A–07C`, `06A–06F`                                      | Shopping-list persistence and derivation                 | Reconcile current implementation with the frozen Shopping contract           |
| 7     | Swap steering                         | `03 / Swap / …`                                           | Ranked alternatives                                      | Add required protein category and optional cost band; use derived total time |
| 8     | Recipe detail                         | `04 / Recipe detail / …`                                  | Static catalogue recipe routes and private snapshots     | Consume serving state; no unrelated recipe taxonomy                          |
| 9     | Cook Mode                             | `05A–05H`                                                 | Recipe content                                           | Add explicit preheat and authored timer cues; keep session state local       |

## Navigation dependency

The approved mobile navigation separates **Home** and **Week**, while the
current application uses `/` as Plan and has no separate Week route. Do not ship
two navigation items pointing to the same destination. Resolve the route split
as part of the active-plan Home slice, then adopt the four-item approved dock.
Until then, keep the current functional destinations and migrate their visual
treatment without inventing a dead route.

## Clean-slate baseline

Before the next slice begins:

- the global header, navigation dock, and former application shell are absent;
- Home is a small composition of shared dashboard sections;
- guest identity changes only the account notice on Home;
- Recipes, recipe detail, and Shopping retain route roots with nominal
  placeholder content only;
- no removed feature UI remains imported or reachable; and
- lint, typecheck, smoke tests, web build, and iOS web build pass.
