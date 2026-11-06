# Allergy journey QA — 6 November 2026

Tested the running V2 web app at localhost:3000 against its V2 development catalogue, plus isolated browser fixtures for authenticated states and real Convex functions in convex-test. Fresh browser contexts kept synthetic allergy selections and guest plans separate from existing user data. No live personal allergy profile or household membership was changed.

Final result: **71 browser tests passed** in the combined run, plus **31 focused allergy domain/backend tests**. Typecheck, lint for the changed test files, formatting and diff checks passed. This pass added test coverage only; no product-code changes were needed.

## Checklist

| Area                            | Verification                                                                                                                                                             | Result                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| Search and aliases              | Live UI: dairy resolves to Milk                                                                                                                                          | Passed                                |
| Multiple selections and removal | Live UI: Peanuts/Tree nuts remain searchable together; remove one without changing the others                                                                            | Passed                                |
| Unsupported text                | Live UI: editable query, explicit not-added message, no save without valid changes                                                                                       | Passed                                |
| Pending edits and explicit save | Live UI: Back preserves edits without applying them; Save applies exactly the chosen IDs                                                                                 | Passed                                |
| New automatic plans             | Live generated plans checked against catalogue evidence; identified and relevant uncertain Milk matches excluded                                                         | Passed                                |
| Refresh persistence             | Live plan and saved guest allergies survive reload unchanged                                                                                                             | Passed                                |
| Existing meals                  | Live plan with a manually chosen Milk recipe stays byte-for-byte unchanged after saving Milk; warning appears                                                            | Passed                                |
| Shopping state                  | Live guest shopping screen unchanged; Convex regression verifies a populated saved list, checked items, slots and plan remain unchanged                                  | Passed                                |
| Recipe listing                  | Live two-column listing shows the Milk badge on the matching recipe                                                                                                      | Passed                                |
| Recipe details                  | Live detail shows the notice and matching ingredient-row text/icon; reminder visible                                                                                     | Passed                                |
| Manual swaps                    | Live guest swap succeeds; controlled picker checks identified and uncertain warnings                                                                                     | Passed                                |
| Weekly adjustments              | Real adjustment component in a controlled browser keeps days/servings when returning from allergy management                                                             | Passed                                |
| Household sharing               | Real Convex functions with two isolated identities verify share on/off, private space, access boundaries and leaving; controlled UI verifies reactive household warnings | Passed in isolated account tests      |
| Guest-to-account continuity     | Controlled browser verifies explicit adoption, retaining existing account selections and unadopted guest choices                                                         | Passed in simulated sign-in states    |
| Failed account save and retry   | Controlled rejection verifies retained edits, sharing state and successful retry                                                                                         | Passed with simulated backend failure |
| Offline guest save              | Live browser network disabled; local save succeeds, then connectivity restored                                                                                           | Passed                                |
| Concurrent guest saves          | Two real pages in one browser context; stale panel cannot overwrite newer saved choices                                                                                  | Passed                                |
| Mobile layout                   | Live 390 × 844 viewport and controlled 390 × 560 short viewport; body scrolling, touch targets and visible save action checked                                           | Passed in browser emulation           |

## Scope and limits

Clerk sign-in and household journeys were exercised with simulated authenticated browser states and isolated backend identities, not two logged-in real Clerk test accounts. This verifies feature behaviour without changing personal account data, but does not constitute a live sign-in/household integration test.

The software keyboard and safe areas were checked through short viewport and browser layout tests. A physical iPhone/Capacitor keyboard session was not available in this run.

No product defects were found during this pass. One new test initially compared rendered inner text against raw DOM text; its whitespace assertion was corrected. Product behaviour was unchanged.

## Repeatable coverage

- `tests/e2e/allergies-live.spec.ts`: running app, public catalogue, real guest storage, offline mode and two-tab concurrency.
- `tests/e2e/allergies.spec.ts`: real components with controlled account, household and failure responses.
- `tests/e2e/planning-setup.spec.ts`: existing mobile/desktop planning journey.
- `tests/e2e/household.spec.ts`: existing household, planner, dashboard and shopping UI regression coverage.
- `convex/allergies.test.ts`: matcher, authorization, household aggregation and unchanged persisted plan/shopping data.

The live tests can run against the normal Playwright production server configuration. This run used the already-running development app to avoid interrupting it or rebuilding its output.
