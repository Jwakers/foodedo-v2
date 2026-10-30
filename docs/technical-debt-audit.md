# Technical-debt audit — 30 October 2026

The agreed programme preserves persisted data and public APIs. The audit covered auth/routing, UI and domain/platform dependencies, Convex authorization and lifecycle operations, native integration, test harnesses, builds and architecture documentation. Broad inspection was followed by a duplication/dependency pass and a challenge against actual benefit and regression risk.

## Review batches

1. **Browser baseline:** restore the household fixture's recipe-save provider and identity listeners; supply explicit public browser constants; dispatch actual `StorageEvent` objects. Fail controlled fixtures on unexpected page exceptions. Share only in-memory Vite bundling and production CSS loading; keep scenario mocks visible. The repaired full Chromium baseline passed 173 tests before the production refactors.
2. **Domain and documentation:** remove the unused placeholder, migrate internal guest-draft aliases while retaining compatibility exports/readers, and move recipe-repair validation out of the drawer. Correct superseded claim/list lifecycle descriptions and distinguish mocked tests from release proof.
3. **Recipes:** share source resolution between Detail/Cook and controlled metadata fields between the two import editors. Keep UI recovery, servings, provenance, revision checks, finalization and admin editing independent.
4. **Shop:** separate query/URL selection, list preparation, optimistic cache updates and history/provenance drawers. Server caches remain authoritative; keep mutation-specific behaviour explicit.
5. **Meal plans:** preserve endpoint names and transactions while extracting view contracts/hydration, selection/proposals and creation helpers. Reuse slot limits and compose overlapping frontend plan types.

## Independently reproduced bug: native Saved navigation

The native-style list deliberately keeps refinements locally. The first-save regression initially assumed URL parameters would seed those refinements. After correcting setup to use actual native controls, the test reproduced a product failure: View saved changed the URL to `/recipes?scope=Saved`, but retained the search and All scope. The targeted correction consumes the existing navigation event and Saved entry URL, resetting local search, filters and sort. Web pagination and native local refinement remain distinct. This is unrelated to the reported production login flicker.

## Separate task: production login flicker

Status: reported, not reproduced by this audit. Modal Clerk sign-in, account hydration and independent continuation handlers are distinct from HTTP redirects; the repository alone cannot establish which causes the observed sequence.

Capture URL/document navigations and visible transitions for ordinary sign-in and Keep Plan, Save Recipe, Import and invitation entry points. Cover email/Google, cancellation, expired sessions and slow connectivity. Record whether the symptom happens before the form or after authentication. Use a dedicated development account for authenticated reproduction. Deliver the exact sequence, root cause, a regression at the cheapest correct layer and a narrow fix proposal. Do not record callback tokens/credentials or introduce a global auth coordinator without evidence.

## Deferred lifecycle and scaling risks

- `users.deleteFromClerk` collects an account's growing history in one mutation and does not explicitly enumerate recipe-import jobs. Design bounded cleanup and import-job/storage handling together with deletion authorization and scheduled work; existing retention scheduling is not immediate account deletion.
- Un-saving a recipe reads all owner shopping items to check references. Measure with a large history before designing a reverse-reference index.
- Recipe-edit reconciliation touches every historical plan referencing the recipe. Preserve archived-list correction semantics when considering bounded processing.
- Full catalogue and household-favourite reads grow with content and membership. Any replacement must preserve complete standard-catalogue availability, deterministic selection and all-member preference semantics. Arbitrary `take()` truncation is not a scaling solution.

These are code-level growth risks, not observed production capacity incidents. No schema change, data migration, truncation or deployment is included.

## Unresolved documentation/product discrepancies

- Identity/guest guidance restricts the full Adjust sheet to accounts, while accepted ADR 0009 and the implemented setup journey allow guests to choose basic days, date and servings. Keep existing behaviour and the distinction between basic setup and persisted personalization; clarify the capability wording in a separate product decision rather than silently broadening guest persistence.
- The shopping-history drawer still describes a 30-day inactivity lifetime, while the current Shop contract specifies the owning plan's lifetime. This refactor preserves copy; align that promise separately with the product owner. No inactivity cleanup is introduced.
- Historical foundation scope and pre-launch checklists are not current release evidence. Passing mocked browser tests/builds does not establish live web OAuth or device behaviour.

## Rejected abstractions and boundaries

Keep the existing domain/platform boundary, indexed authorization helpers, modular selector and IndexedDB adapters. Preserve public SEO migration redirects and the isolated native OAuth bridge. Do not split import/admin pipelines solely by file length, merge unlike recipe editors, create a generic mutation framework, add a state-management dependency, or optimize unmeasured renders. No V1/CMS/backend changes, provider upgrades or production deployment.

## Verification

Run the repository CI matrix: formatting, lint, TypeScript, domain tests, Convex/rendering tests, shopping example audit, native build and isolation checks, web build and content checks, public-recipe cache check, then full Chromium. Builds and browser suites must run sequentially because both use `.next`. Live Clerk–Convex and physical-device release checks remain manual.
