# Meal selection

Meal selection is a pure domain policy shared by local guest drafts and
authenticated Convex mutations. Callers adapt their own recipe records into
candidate facts; the selector never reads storage, authentication, time, or
random state.

## First-pass policy

Each candidate has a stable key, protein category, saved status, optional opaque household-member preference keys, and a dismissal count. A request
contains excluded keys, up to four newest-first plan histories, the saved
preference, and a stable variation key. Rules contribute independently:

- saved recipe: `+20` when requested;
- household consensus: `+10` for the second distinct saving member, `+20` for three or more (capped);
- household balance: up to `+12`, averaging `12 / (1 + already selected favourites)` over the candidate's distinct saving members;
- previous individual dismissals: `-6` each, capped at `-18`, independently of the saved-preference switch;
- protein not yet represented in the generated plan: `+30`;
- exact meal in history positions 1–4: `-60`, `-35`, `-20`, `-10`;
- historical protein occurrence: `-4`, capped at `-16`; and
- forced repetition in a small pool: `-100`.

Selection first uses unique non-excluded meals, then relaxes exclusions, then
repeats only when necessary. Stable hashing of the variation key orders tied
candidates, so retries reproduce a proposal while separate plan attempts can
explore credible alternatives.

The selector itself truncates supplied history to four plans. This keeps the
policy bounded even if an adapter accidentally provides more data, and keeps
the client and server on the same recency model.

Single-meal choices and extensions include the meals being
retained as scoring context. Their protein categories and represented members
count toward variety and household balance, but they are not returned as new
selections. A manually pinned first meal uses the same context before filling
the other meal slots.

## Boundaries

Plan records do not store a seed, score, or recommendation metadata. Guest
drafts derive variation from their existing timestamps and revisions. Convex
mutations use plan identity, revision, target, and proposal variant. The client
history query is owner-scoped and catalogue-only; server mutations may also use
private recipe keys already available in their candidate pools.

Future rules may add cooked-history, dietary safety constraints, explicit time
or cost preferences, and richer personal-recipe generation. Add each as a
small deterministic rule with tests; do not turn the selector into a generic
settings document or an opaque external service.

## Household preferences and privacy

`convex/lib/mealSelection.ts` adapts storage into preference facts. Private
planning uses the acting account's saved recipes; Household aggregates saved
catalogue meals from every current member. A member contributes one vote per
stable catalogue meal ID regardless of saved versions or copies. The balance
rule reduces the contribution of members whose favourites have already been
selected, so a larger library does not gain extra votes. Members without saves
contribute no invented preferences. Membership changes affect the next selection
without copying private libraries into the household.

The client's catalogue-only signal query validates space access and returns
public meal IDs, opaque within-space member keys and dismissal counts. It never
returns another member's imported/manual recipe, saved snapshot, author or
library. Household server candidates use current public catalogue content and
already-shared non-catalogue snapshots, not another member's private imports.
Private saved imports remain eligible in the private server selector. Explicitly
sharing a recipe into a plan retains a stable internal selection key across
snapshot copies. Existing snapshots need no migration.

The existing saved-preference switch controls saved, consensus and balance
rules together; dismissal feedback remains independent. Days, servings and the
choice to use favourites still come from the initiating user's plan setup.

## Accepted and dismissed outcomes

The feedback table stores observed choices. Selection signals are the derived
ranking inputs, combining that feedback with saved favourites and membership.

`mealSelectionFeedback` stores one outcome per space, plan, date and stable
candidate key, with the acting account and update time. `kept` means accepted
into a saved plan, not cooked, eaten or explicitly liked. It does not yet earn
a positive score or trigger save prompts. Cooking/liking prompts remain later
work, as does the dismissible Home explanation of saved favourites.

Successful individual swaps, chosen replacements and removals mark the old
meal `dismissed`; the replacement is `kept`. Choosing the same meal is not a
rejection. Re-selecting a meal on the same plan day changes its outcome back
to `kept`. Failed/stale edits write nothing. Previewing alternatives, replacing
an entire plan, shortening/rebasing a week and undoing a whole-plan replacement
are not recipe-specific dislikes.

Draft edits accumulate up to 100 unique day/meal rejections locally. They
survive refresh, extension and date rebasing; guest access performs no backend
writes. Explicitly saving/claiming the draft records these outcomes atomically
with the accepted plan, under the claim's existing idempotency guard. Abandoned
drafts are not uploaded. Old drafts/clients remain valid because the field is
optional. No historical behaviour is inferred or backfilled.

Ranking reads the newest 200 outcomes in the selected space. Older feedback
falls outside that bounded window as new plans are accepted. Dismissal is always
a mild capped score contribution; it never excludes a candidate or prevents
manual selection. Private and Household feedback stay separate. Account deletion
removes the user's feedback, including household attribution.

## Flexible meals within a dated plan

Plan dates identify an approximate planning window, not a cooking schedule. Stored slot dates remain stable ordering and edit identifiers for compatibility with saved plans, guest drafts and feedback; no storage migration is required. All active meals remain visible and editable after the range ends. Home offers a visual selector of readable meals in stable slot order, without weekday labels. No completion is inferred or tracked.

Whole-plan regeneration has no date-cutoff argument: preview and application consider every occupied slot, preserve empty slots and retain the original full date range, including empty edges. Stale-write checks, explicit approval, shopping-state carryover and undo still apply. The next-plan action gains emphasis from the day before the end date onward without expiring the active plan. Plan-level ranges remain available in setup and history.

## Home meal selector

The approved Paper 13A–13F exploration is implemented as one selector. Embla Carousel v8 owns photograph swiping and snapping; thumbnails scroll independently with native horizontal overflow. Selecting a thumbnail or photo arrow updates the photograph, full title, time, servings, description and both recipe/Cook links together. On mobile, the thumbnail strip bleeds to the viewport edges while its first and last items retain the normal content inset. Selection smoothly brings the chosen thumbnail toward the start of the strip, clamped naturally near the end, without scrolling the page. Photo arrows slide between neighbours; direct thumbnail choices jump to the corresponding photo. Reduced-motion preferences disable these transitions. “View plan” opens the existing Week view. One readable meal needs no arrows or thumbnail strip; unavailable slots remain in the plan but are omitted here.

Thumbnails use the actual recipe title at 14px in a fixed 128px item, with two-line visual truncation and a full accessible button name. Selection has a green outline and heavier text, with `aria-pressed` rather than completion semantics. The main title is never clamped; descriptions are capped at two lines and omitted when missing. There is no numbered progress badge, autoplay or sticky Cook action. Shopping, latest recipes and discovery retain their existing roles below the selector.

An explicit Home selection is tab-local UI state, scoped to the signed-in space and plan, stored in sessionStorage with an in-memory fallback. It survives recipe/Cook navigation and reload in that tab. Persist the slot identity (with a date fallback for older view contracts), not recipe identity, so repeated meals remain independently selectable and a changed plan start date does not reset the choice. A new plan starts at its first readable meal; an unavailable or removed selection falls back to the first readable meal. Recipe and Cook openings do not write completion, history or preference signals. Suggested defaults based on those interactions remain future work and must never override an active explicit choice or reorder/hide alternatives.
