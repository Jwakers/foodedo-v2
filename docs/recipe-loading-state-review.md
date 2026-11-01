# Recipe loading continuity review — 1 November 2026

## Reproduction and cause

The private query route has two independent sources of header removal:

1. `AccountSyncGate` replaced its children, including all providers and
   `AppShell`, with a skeleton while `users.current` was unresolved. This also
   removed the header and navigation. Reusing the recipe skeleton alone could
   not preserve the surrounding layout.
2. `AppHeaderFallback` returned nothing for `/recipes/view`, leaving no header
   space in the pre-hydration HTML when search parameters suspended the header.

The controlled browser reproduction uses the real shell, providers, private
recipe component and account boundary, substituting SDK/router responses to
hold each hydration stage. The before recording and regression fail when the
header disappears. This reproduces the reported symptom without accessing or
modifying the supplied private production/development recipe.

Recordings are local artifacts outside Git:

- [Before](/Users/jackwakeham/.codex/visualizations/2026/10/30/01a18caf-0bfd-77e1-a372-2ce2178dad67/recipe-header-continuity/before.webm)
- [After](/Users/jackwakeham/.codex/visualizations/2026/10/30/01a18caf-0bfd-77e1-a372-2ce2178dad67/recipe-header-continuity/after.webm)

## Fix

`AccountSyncGate` still owns account readiness and provisioning. For
`/recipes/view`, it now supplies its blocking fallback to `AccountSyncContent`
inside the shell. Only the recipe content is replaced while the shell remains
mounted. Other private routes retain their current gate placement.

Header fallback and live header share `AppHeaderFrame`, reserving the same 54px
bar plus the platform safe-area inset. The fallback works for every route that
uses the shell header; cooking and Home retain their intentional chrome rules.

Query-recipe content is keyed by session owner instead of household space.
Late household hydration does not remount a loaded recipe or clear servings.
Changing owners still resets private content. Canonical public recipe content
continues to use its existing stable public key.

## Conditional-state audit

| State                                          | Recipe body                                            | Header/navigation and layout                                                   |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Static query shell; search parameters suspend  | Shared recipe skeleton                                 | Real header fallback reserves bar and back control; navigation stays present   |
| Clerk unresolved or Convex token pending       | Private recipe account check uses shared skeleton      | Shell stays mounted                                                            |
| Account subscription unresolved or mismatched  | Content boundary blocks recipe with shared skeleton    | Shell stays mounted; no personal query is enabled by the fallback              |
| Confirmed missing account                      | Existing provisioning/retry UI inside content boundary | Header and dock remain mounted                                                 |
| Account query exceeds ten seconds              | Existing slow-account recovery inside content boundary | Recovery changes the body, not shell geometry                                  |
| Account recovery fails or account is deleted   | Existing error and sign-out controls                   | Shell remains mounted; mutation completion cannot open the gate                |
| Account ready, private recipe query unresolved | Same shared skeleton from recipe component             | No intermediate loading-text layout                                            |
| Private recipe resolves                        | Recipe content replaces skeleton                       | Hero and skeleton both reserve 267px image height                              |
| Late household subscription or space selection | Existing recipe retained for the same session owner    | No content-key remount; servings preserved                                     |
| Account switch                                 | Private content resets and waits for matching account  | Header and navigation persist; previous owner's content is hidden              |
| Session becomes signed out                     | Private recipe sign-in prompt                          | Header persists; recipe and private queries are removed                        |
| Convex authentication fails                    | Existing connection-recovery UI                        | Header persists; no private recipe is shown                                    |
| Canonical public recipe hydration              | Server seed stays visible, live query enhances it      | Existing stable public shell/content; failure notice is fixed above navigation |
| Favourite saved state resolves                 | Button changes enabled/saved state                     | Fixed-size controls reserve their space on canonical public recipes            |
| Plan action becomes ready                      | Existing button becomes enabled                        | Button remains present while capability loads                                  |

Source metadata, missing-detail notices and recipe sections arrive together with
the recipe data. Their presence reflects the recipe itself. Serving panels and
drawers expand through explicit interaction. These do not need a global loading
screen or permanently empty reserved sections. Image loading stays within its
fixed container.

## Review and verification

Reviewed readiness propagation, hook query guards, component keys, Suspense
fallbacks, recovery timers, mutation completion, account switching, sign-out,
household hydration, fixed overlays and image geometry. No new auth coordinator,
backend change or early-private-access exception is introduced.

The browser regression samples eight animation frames at each of six hydration
stages. It checks the 54px header, 54px content origin, fixed navigation position
and retained header node. It also checks servings across household hydration,
owner-change resets, connection-error privacy and sign-out privacy. A separate
real-build test disables JavaScript to verify header/skeleton geometry for both
private and catalogue query URLs before hydration. Existing tests exercise
delayed, missing, deleted and failed account recovery and public reading state.

Physical iOS safe-area behavior and the user's signed-in development session
have not been recorded in this pass. The web and iOS export builds verify the
same shared components compile for both targets.

Final review outcome: no outstanding actionable findings in the changed paths.

- Full Chromium suite: **196 passed**, no retries.
- Routing unit checks: **9 passed**.
- Lint, typecheck, changed-file formatting and diff whitespace checks: passed.
- Web production build and public-page/recipe build checks: passed.
- iOS static export and native isolation checks: passed.

No deployment was performed.
