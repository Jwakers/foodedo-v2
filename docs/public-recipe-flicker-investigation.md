# Public recipe refresh flicker — 31 October 2026

Production investigation followed by a local continuity fix. No backend changes
or deployment. Working tree was clean at the start; local source inspected at `4453bb3`.
The deployed revision was not verified.

## Production reproduction

URL: `https://www.foodedo.com/recipes/sausage-tomato-and-spinach-gnocchi-bake`.
The page was already open in the existing Arc session. Account setup appearing
during the capture establishes that Clerk resolved signed-in. No sign-out,
credential entry, saving, planning or other personal mutation was performed.

DevTools Performance, with Screenshots enabled and no CPU/network throttling,
captured the following sampled sequence using Record and reload:

| Time from recipe navigation start | Visible state                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------- |
| 179 ms                            | Recipe text, controls and navigation; hero image placeholder                      |
| 216 ms                            | Recipe and hero image visible                                                     |
| 1,061 ms                          | Entire recipe, header and navigation replaced by “Preparing your Foodedo account” |
| 1,201 ms                          | Recipe, header and navigation return                                              |
| 1,323 ms                          | Recipe header actions are visible                                                 |

The main interruption lasts approximately **140 ms** between sampled frames.
A second recording started with Record followed by normal Cmd-R reproduced the
same recipe → account setup → recipe transition, with an approximately **147 ms**
interruption. Its times are relative to the first screenshot because recording
missed the initial document navigation events. These are diagnostic observations,
not exact React commit times or stable latency measurements.

The first trace contains one committed recipe document and one Document request
for the same URL, returning 200 HTML. No auth redirect chain is evident. The
recording initialization also has an empty navigation entry; it is not evidence
of an application redirect. The response is marked as service-worker-mediated,
with response source `network`, as in the earlier Home investigation. This does
not establish stale content or ownership of that worker. A clean-profile check
remains useful; do not unregister anything in the user's browser.

Local artifacts live outside Git in this chat's visualization directory under
`recipe-flicker-2026-10-31/`: both raw traces, a compact filmstrip, and an HTML
replay supporting quarter-speed playback, scrubbing and frame stepping. Keep raw
traces local because they can contain personal resource URLs.

## Cause supported by the capture and local source

The public recipe initially renders correctly. `PublicRecipeDetail` already keeps
the server recipe while the public live query is unresolved through
`current ?? initialRecipe`. Replacing that data fallback is not the first fix.

`AppProviders` wraps the entire product subtree in `AccountSyncGate`. Before
Clerk/Convex authentication is ready, the gate returns its children, allowing the
public recipe to appear. Once both are ready, an unresolved `users.current`
subscription causes the gate to return `AccountSyncWaiting` instead. That removes
the whole recipe and its shell. A matching account then mounts them again.

The earlier change gave Home a consistent loading presentation, scoped to `/`.
It did not change this behavior on recipe routes. The captured full-page setup
screen matches the non-Home branch of the existing gate. A normal existing-account
read can trigger that screen; it does not prove account provisioning occurred.

There is a second **code-level remount risk**, separate from the captured setup
screen: `AppShellChrome` keys its page-content wrapper by `spaceKey`. Its initial
guest key changes as account/household state resolves. Even if the account gate
stops replacing public content, this key can still remount a public recipe and
reset local recipe state. A continuity fix must address both boundaries. This
capture does not separately prove a servings reset or quantify the key's effect.

## Proposed solution

Keep public catalogue content mounted independently of account readiness, while
holding account-dependent queries and actions until the current account matches.
The desired sequence is **recipe remains visible → account controls become ready**.
Public reading should continue during slow, failed or missing-account recovery.

1. **Make application account readiness explicit using the existing account
   subscription.** Publish its matching/not-ready result through a small context
   consumed by the existing auth/capability hooks. Keep direct SDK state for
   establishing the session and reading `users.current`, avoiding a dependency
   cycle. Personal queries, mutations and continuation handlers must not treat a
   valid Convex token alone as a provisioned Foodedo account.
2. **Let the canonical public recipe retain its subtree.** Use an explicit public
   route capability, initially limited to `/recipes/[slug]`, to keep reading
   content visible while only account-dependent controls wait. Present slow or
   failed account recovery in a bounded account-status area rather than replacing
   the recipe. Preserve the existing blocking gate on private destinations and
   preserve missing-account recovery, retries, deletion and subject matching.
3. **Keep public recipe identity independent of personal space.** Retain keyed
   remounts for private/household state that needs them, but do not key the public
   recipe body by the active account/household. Its live public subscription may
   update the displayed revision in place; it should not require remounting.

Do not simply return all children from the current gate while its query loads.
`HouseholdProvider`, onboarding, Save, Plan and continuation components currently
rely on that gate before starting personal queries. Audit raw SDK consumers as
well as `useFoodedoAuth`; for example, the admin navigation link reads Convex auth
directly. All account-dependent consumers that can remain mounted on a public
route must be covered before allowing the public subtree through.

Do not add a delay just to suppress the setup screen, or put a loader in front of
already-rendered recipe content. Either approach leaves the remount/state problem
and degrades slow connections. No backend schema change, new identity provider,
global intent coordinator or redirect rewrite is justified by this evidence.

Start with the reproduced canonical recipe route. Audit `/recipes`, catalogue
`/recipes/view` and Cook separately before broadening route classification. Import,
Edit and personal `recipeId` links must not be mistaken for public catalogue
pages. Other product pages share the gate in code, but their flicker has not been
captured in this investigation.

## Acceptance and regression checks

- Hold Clerk, token, account, household and private query readiness independently.
  From the initial HTML onward, the recipe hero, title, ingredients and method
  remain present; no full-page setup screen or blank interlude appears.
- Assert the same public recipe subtree survives the readiness changes. Change
  servings and open recipe notes before account resolution, then verify those
  choices persist. Check scroll and focus continuity where relevant.
- Verify Save/Plan behavior and pending continuations remain inactive until the
  matching account is ready. Test an unresolved account, missing account, failed
  provisioning, deletion, account switch and late response; assert no early
  personal queries or writes. Keep existing private-route gate tests.
- Preserve guest reading, catalogue cooking, public initial HTML, schema and
  no-JavaScript discovery. Reserve geometry for late account controls so adding
  them does not shift the recipe.
- Capture the same production-like recipe refresh before/after, including slow
  connectivity, warm/cold cache and a clean profile. Compare both filmstrip and
  document navigation, rather than relying only on final-screen assertions.
- Run lint, TypeScript, focused auth/public-recipe regressions, `pnpm build` and
  `pnpm build:ios:web`. Keep server recipe/cache code out of the native export;
  verify shared account-readiness behavior separately on iOS.

This investigation reproduced two signed-in refreshes of one public recipe.
Guest/cancelled/expired-session, slow-network, clean-profile and device captures
remain validation work; the proposal is not a claim that those flows were tested.

## Implementation

Canonical `/recipes/[slug]` pages now keep their public subtree mounted while
Clerk, Convex and `users.current` resolve. The existing account query supplies a
small readiness context; `useFoodedoAuth` permits personal capabilities only when
its account subject matches the current Clerk user. The context defaults closed.
Private routes retain their existing page gate. Admin navigation also uses this
readiness rather than the raw token state.

Account-dependent continuation effects mount only after readiness, keyed by owner,
so their private subscriptions and per-account refs remain isolated while the
public body remains mounted. Native invitation listening still runs for guests.
No continuation priority or persistence policy changed.

Public recipe content has a stable shell key independent of account/household
space. Its servings, notes, focus and reading position survive session changes.
The shared header has a public-recipe Suspense fallback and reserves the favourite
and overflow controls before live recipe data arrives. Unknown recipe state uses
a disabled favourite; resolved signed-out state uses the existing sign-in prompt,
and matched signed-in state enables saved-state toggling. No false server-side
saved state is emitted.

Routine account hydration is quiet. Slow or failed account provisioning uses a
bounded notice above the navigation instead of replacing the recipe. Retry uses
the existing provisioner; deletion offers sign-out. Signing out from this notice
keeps the same recipe URL and reading state.

Six controlled browser regressions render the real shell, providers, account gate,
public recipe body and favourite logic with only SDK/router/source responses
substituted. They verify retained component identity, servings, notes, focus and
scroll across auth stages; no early private reads/writes; one resumed guest save;
account/household changes; failed/deleted/slow account recovery; sign-out in place;
and a successful provisioning retry without resetting choices. Real-build checks
also cover initial-HTML favourite presence and reading with Clerk/Convex blocked.

The production captures above remain the before evidence. The fix has not been
deployed or re-captured in a live signed-in production session, and physical iOS
authentication remains a release check.

## Final local verification

- Complete Chromium suite: **191 passed**, no retries.
- Routing unit regressions: **9 passed**, including public/private route scope.
- ESLint, TypeScript, changed-file Prettier checks and `git diff --check`: passed.
- `pnpm build`: passed, including analytics deployment-trace checks.
- Web public-page and public-recipe build checks: passed.
- `pnpm build:ios:web`: passed. Native blog, public-page and public-recipe
  isolation checks passed.

No Convex schema, backend, auth provider, production deployment or production
account data changed. The pre-existing Home recovery behavior and private-route
account recovery tests remain green.
