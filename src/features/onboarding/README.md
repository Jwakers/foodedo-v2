# Contextual onboarding

Approved Paper page: [12 — Contextual onboarding](https://app.paper.design/file/01M0FD2K4HNTJZ5MET5T0CNYP7/p-4-0).

- Home explains suggested plans below the planning action. Successful generation or dismissal retires it; merely visiting Home does not.
- Recipes has a compact hint above the grid, explaining Saved and future planning. A successful catalogue favourite or manual dismissal retires it permanently. Saving is never required before planning.
- The first successful saved plan refines the existing confirmation to introduce its generated shopping list. Later confirmations have ordinary Week/Shopping actions. Counts come from actual planned slots, including free days and singular dinners. There is no separate empty-ingredients onboarding state.
- Household explains shared favourites in place. A one-member household is ready to share and supports independent planning. “View my week” still selects that household, not Private.
- Help is permanent: signed-in account menu or guest header. Its standard drawer (shared header, scrollable body and fixed footer) leaves the current page mounted, retaining URL, filters, drafts and scroll. Closing or pressing Escape returns to the same task. There is no new route or sign-in boundary.

The shared registry lives in `src/lib/domain/onboarding.ts`: stable IDs are independent of routes and copy. Retirement is an additive list of IDs, so another introduction does not require another user-schema field. Existing boolean flags and the versioned browser format are still read. Unknown stored IDs are retained, so an older app cannot erase a newer app’s state.

`OnboardingProvider` owns one account subscription, browser-store subscription and account-sync boundary. Screens use `isRetired(id)` and `retire(id)`. `ContextualIntroduction` supplies common visibility, dismissal and 44px targets while each feature owns its copy, placement and relevance rules. The permanent guide remains a small, separate content list.

Guests store device-local flags with a memory fallback when storage is blocked. Only dismissals made during the current mounted guest visit transfer once on sign-in; old guest flags never suppress guidance for every account using the device. Signed-in local state and queued writes are scoped to the initiating Clerk subject. Failed syncs remain pending locally and retry on reconnect, remount or a later dismissal. There is no retry timer or blocking UI.

`convex/onboarding.ts` owns the authenticated API; `convex/lib/onboarding.ts` owns compatibility, existing-user inference and plan-save bookkeeping. A successful favourite and the first saved plan update retirement state in their existing transactions. Completed introductions avoid unnecessary history queries. Failed generation/saves do not count as completion.

To add a contextual introduction later:

1. Add a stable ID to the registry. Do not rename existing IDs to change wording.
2. Place a `ContextualIntroduction` in the relevant feature, with that feature’s eligibility rule and copy.
3. Call `retire(id)` after the relevant successful interaction, or `retireIntroductions` inside its backend transaction when applicable.
4. Add a guide entry only if lasting help is useful; test the new retirement/eligibility behaviour.

The first-save plan ID is deliberately specific to the plan lifecycle. New features should not reuse it as a generic onboarding step or add unrelated logic to meal planning. This remains a small persistence contract and presentation primitive, with no journey engine, queue, tour, checklist, progress tracking, analytics or recipe prerequisite.
