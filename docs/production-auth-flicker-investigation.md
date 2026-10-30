# Production auth flicker — investigation and isolated fix plan

30 October 2026. Production capture followed by a local presentation fix.
No backend changes or deployment. Local source initially inspected at `f0e1ce2`;
the deployed revision was not verified.

## Reproduced production sequence

Two refreshes of `https://www.foodedo.com/` in the existing signed-in Arc session
reproduced the same visible sequence. The account already had a saved plan.
No sign-out, credential entry, plan save, import or invitation acceptance was
performed. Capture used DevTools Performance with Screenshots enabled, providing
sampled screen frames rather than continuous video.

| First capture, relative to navigation start | Visible screen                                           |
| ------------------------------------------- | -------------------------------------------------------- |
| 413 ms                                      | Blank page                                               |
| 432 ms                                      | Welcome: “Make food decisions easier” and sign-in action |
| 693 ms                                      | Dashboard skeleton and navigation                        |
| 763 ms                                      | Same skeleton, now with account avatar                   |
| 986 ms                                      | Whole page replaced by “Preparing your Foodedo account”  |
| 1,105 ms                                    | Dashboard skeleton and navigation return                 |
| 1,464 ms                                    | Saved-plan Home: “What sounds good?”                     |
| 1,529 ms                                    | Saved-plan Home remains visible                          |

These are sampled observation times, not exact component commit times or
performance targets. The first capture used Record and reload. Its trace contains
one committed Foodedo document, one root Document request, and a 200 HTML response.
The recording initialization also exposed `about:blank`; that is a capture-tool
transition, not evidence of an application redirect. The trace does not establish
an auth redirect chain. A second capture, started with Record followed by normal
Cmd-R, reproduces Welcome → skeleton → setup → skeleton → Home. That second trace
misses the initial navigation events and corroborates the visual sequence only.

The first root response is marked `fromServiceWorker: true`, with
`serviceWorkerResponseSource: network`. V2 source declares no service worker.
This warrants a clean-profile comparison and inspection of the controlling worker
before attributing any additional behavior to caching. It does not prove stale
HTML or establish the worker's origin. Do not unregister it in the user's browser
as part of this investigation.

## Evidence and limits

Artifacts are local, outside Git, under this chat's visualization directory in
`auth-flicker/`: `production-refresh.json.gz`, `normal-refresh.json.gz`,
`production-refresh-filmstrip.png`, and `refresh-replay.html`. The replay supports
quarter-speed playback, scrubbing and individual-frame stepping. Raw traces may
contain personal resource URLs and should remain local; no credentials were
entered during capture.

This proves a signed-in Home refresh defect. Ordinary email/Google sign-in,
continuations, cancellation, expired sessions, throttled connectivity, clean
profiles and iOS have not yet been captured. Do not generalize the refresh finding
to those journeys or claim their root causes are established.

## Code explanation for the observed screens

The local code provides a direct explanation for each transition:

1. `src/components/use-home-entry-state.ts` explicitly returns `loading` while
   Clerk is unresolved. `src/features/welcome/home-entry.tsx` renders Welcome for
   every state except `home`. Consequently, `loading` renders an actionable
   signed-out screen, including during initial rendering of an existing session.
2. When Clerk resolves signed-in, Home mounts Dashboard.
   `src/features/dashboard/dashboard.tsx` correctly waits for Convex auth,
   household selection and the current-plan query, showing its skeleton.
3. `src/features/auth/account-sync-gate.tsx` allows children before Convex auth
   is ready, then replaces them with `AccountSyncWaiting` when auth becomes ready
   and `users.current` is still `undefined`. Routine account subscription loading
   therefore receives the same full-page setup presentation as missing-account
   recovery. This removes AppShell and its providers, header and navigation.
4. When the account query resolves to the current user, children mount again.
   Household and plan readiness can still require the dashboard skeleton before
   showing the saved plan.

The Welcome fallback is a definite local code defect. The gate's changing subtree
explains the second visual interruption and can remount continuation components.
The capture does not demonstrate duplicate mutations or conflicting continuations.
There is no evidence here requiring a global auth coordinator, auth provider
replacement, server-side session migration or redirect rewrite.

## Proposed isolated implementation

Keep Clerk, Convex authorization, account provisioning and continuation ownership.
Change the presentation of unresolved state, with explicit scope boundaries:

1. **Home entry:** handle `loading` explicitly. Render a neutral loading surface
   rather than Welcome until Clerk resolves. Keep first-time guests' Welcome and
   the existing guest skip/`?try=1` behavior after resolution.
2. **Routine account hydration:** distinguish unresolved `users.current` from a
   confirmed missing account. For Home, use a visually consistent loading surface
   across entry/auth/account/household/plan readiness, with reserved layout so the
   header and dock do not disappear and return. Reuse a small presentation
   component with explicit wrappers; do not create another auth state store.
   Preserve the account gate: never mount account-dependent children early just
   to hide the flicker. Do not globally block public catalogue HTML while Clerk
   loads. Decide the exact placement within the existing provider hierarchy in
   the implementation review; moving AppShell above the gate wholesale would
   change which queries/continuations run and exceeds this presentation fix.
3. **Real recovery:** keep the automatic `ensureCurrent` attempt only for a
   confirmed missing user. Preserve subject matching, account-switch guards,
   deleted-account handling, retries and guest escape. Routine sub-second query
   loading should not announce that an existing account is being set up. Retain
   useful slow/failure messaging using the existing delayed-state behavior;
   do not add an artificial minimum wait to mask the transitions.

Ship no continuation arbitration change in this patch. If a separately captured
journey proves two handlers are competing, fix that demonstrated precedence or
idempotency defect separately, with its own reproduction and regression.

## Regression and verification plan

Add a controlled browser regression spanning the actual Home selection and gate,
not only a hook test or final-screen assertion. Drive readiness in order:
Clerk unresolved → Clerk signed-in/Convex loading → Convex authenticated/account
unresolved → matching account → household unresolved → plan unresolved → saved
plan. Hold each stage long enough to assert its visible content. Require no
Welcome/sign-in action or setup-page flash during routine hydration, consistent
loading geometry, correct final Home, and no unexpected document/route navigation.

Include initial server HTML/hydration in the reproduction: a client-only fixture
cannot prove the initial Welcome flash is fixed. Exercise both existing sessions
and guest-session restoration. Extend the existing account-sync fixture coverage
for unresolved versus missing accounts; retain its failure/retry/deletion/switch
checks. Do not suppress existing recovery requirements by updating screenshots.

| Journey                | Required capture and assertions                                                                        | Current status                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Signed-in Home refresh | Warm/cold cache; clean and existing profile; URL, document requests and visible states                 | Reproduced twice in existing profile |
| Ordinary sign-in       | Email and Google; record before form and after completion; intended destination                        | Pending                              |
| Keep Plan              | Exact reviewed week survives; one claim; one intended destination                                      | Pending                              |
| Save Recipe            | Correct meal saved once; return context and confirmation retained                                      | Pending                              |
| Import                 | Intent/job retained; no duplicate job; existing-job reauthentication returns correctly                 | Pending                              |
| Invitations            | Token redacted in evidence; resume correct join page; no unintended plan claim or automatic acceptance | Pending                              |
| Cancellation           | Repeat each relevant entry point; modal closes; local work remains; no personal write                  | Pending                              |
| Expired session        | Private data stops rendering; reauth resumes intended action once                                      | Pending                              |
| Slow/offline recovery  | Delay Clerk, Convex token, account and plan separately; retain local drafts and meaningful retry       | Pending                              |

Use a dedicated test account and disposable fixtures for journeys that write data.
Capture network/document navigation alongside screenshots, recording only redacted
paths around OAuth callbacks and invitations. Record deployed revision, profile,
cache, CPU/network settings and initial pending intents. For redirect suspicion,
use Network Preserve log and distinguish Document/3xx requests from client route
changes and same-URL renders. The filmstrip establishes visible screens; readiness
instrumentation or controlled fixtures must establish the responsible state.

After implementation: Prettier, lint, typecheck, relevant browser/account recovery
regressions, `pnpm build` and `pnpm build:ios:web`. Repeat production-like filmstrip
capture and the live matrix before declaring all login flicker resolved. Verify
native behavior separately; shared loading changes must retain static export.

## Critique and implemented scope

Two review passes tightened the proposal before implementation:

- Keeping the shell visible by moving it above the account gate would change
  when personal queries and continuation handlers mount. Preserve that boundary.
  Instead, withhold Home's account controls and dock until its dashboard is ready.
  Show the same branded loading layout before Clerk resolves, while the account
  query is unresolved, and while household/plan queries are unresolved. This
  prevents the chrome from appearing, disappearing, and appearing again.
- The public web homepage has an explicit no-JavaScript content contract. A
  loader-only initial document would regress it. Keep the public Welcome content
  and discovery links in a web-only `noscript` fallback. The scripting-enabled
  document shows the loader immediately; it does not first paint Welcome and
  hide it in an effect. Native entry remains independent of the web fallback.

Implementation reuses the dashboard's existing auth/household/plan readiness in
`useDashboardState`, so Home entry and chrome make the same presentation decision.
Matching Convex subscriptions share cached data; the shell skips the Home plan
query on other routes. This hook does not own authentication or continuations.

`AccountSyncWaiting` uses the shared Home loading presentation only for unresolved
account reads on `/` before its existing ten-second deadline. It still blocks
account-dependent children. Confirmed missing accounts retain their existing
provisioning and recovery UI; delayed unresolved reads still offer guest escape
and help. Account identity checks and all mutation/continuation logic are unchanged.

The account-sync browser fixture now exercises production Home entry, chrome
selection, account gate, household provider and dashboard readiness together.
Only final dashboard content and external SDK/router boundaries are substituted.
It holds each hydration stage, checks identical loading bounds, checks that
Welcome/setup/chrome do not appear, and verifies one initial document navigation
followed by the saved-plan destination. Additional regressions cover the delayed
unresolved-account escape and guest skip persistence across reload. The existing
recovery, deletion and account-switch scenarios remain in the same suite.

The public HTML regression checks both scripting modes and opens the actual
production build with JavaScript disabled to verify useful content and links.
These controlled checks do not replace the pending live email/Google,
continuation, expired-session or physical-device matrix above.

## Final local verification

- Complete Chromium suite: **179 passed**, no retries. This includes the real
  production build with Clerk blocked on initial load and refresh, public content
  with JavaScript disabled, and the controlled hydration/recovery regressions.
- ESLint, TypeScript, changed-file Prettier checks and `git diff --check`: passed.
- Welcome-session persistence unit test: passed.
- `pnpm build`: passed, including analytics deployment-trace checks. Its first
  sandboxed attempt failed DNS resolution for public content services; the
  network-enabled build completed successfully.
- Public-page and public-recipe web build checks: passed.
- `pnpm build:ios:web`: passed. Native blog, public-page and public-recipe isolation
  checks also passed.

The first full browser run found that the legacy URL audit parsed `noscript` as
text. Its no-JavaScript audit now explicitly parses with scripting disabled,
retaining the same heading/content/canonical requirements. The final full run
above includes that correction. No production deployment or new live-account
authentication was performed.

## P2 follow-up: escape from stalled Home hydration

Review reproduced a remaining dead end: when Clerk stayed unresolved, or an
account was ready but its household/plan read stayed unresolved, Home could hide
all navigation indefinitely. The account gate's recovery timer did not cover
those stages.

The shared Home loading content now offers **Try again** and **Browse recipes**
after ten seconds. Its initial loading presentation is unchanged. Retry reloads
the current document without clearing local drafts; Browse recipes uses the
shared public `/recipes` route on web and iOS. This is presentation-only and
neither opens an account gate nor writes personal data. Account provisioning and
its existing slow-setup recovery remain separate.

The timer is cleaned up when loading content unmounts, and a late successful
response still reveals the dashboard and navigation automatically. Controlled
regressions cover stalled Clerk, token, household and plan stages, the initial
ten-second grace period, mobile recovery controls, late responses, and draft
preservation across retry. The real-build blocked-Clerk regression also follows
the recovery link into the public recipe listing.

P2 verification: **48 Chromium tests passed**, with no retries, across account
recovery, Home and organic discovery. Lint, TypeScript, changed-file formatting,
both production builds and the web/native public-content isolation checks passed.
The tests confirm that delayed recovery appears without a Welcome/setup flash,
retry preserves the local draft, and late responses still resume automatically.
