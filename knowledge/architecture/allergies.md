# Allergy assistance

Approved scope: [Foodedo V2 allergy journey in Paper](https://app.paper.design/file/01M0FD2K4HNTJZ5MET5T0CNYP7/p-6-0). This slice adds allergy assistance within existing views. It does not redesign the planner, create account pages, offer automated replacement of affected meals, or introduce general dietary preferences/exclusions.

## Profile and entry points

Plan setup and the existing Edit this week drawer open the same contextual Allergies panel. Search uses a reviewed, code-owned vocabulary; aliases such as dairy resolve to Milk, while nuts offers Peanuts and Tree nuts separately. Multiple selections remain visible. Unsupported text stays editable and cannot be saved as an allergy. Lactose intolerance, coeliac disease and gluten restrictions are not silently mapped to milk/wheat allergy.

`allergyProfiles` belongs to an authenticated user, indexed by owner, with bounded canonical IDs, a household-sharing switch and an optimistic-concurrency revision. Saving is explicit and independent of planning preferences and their weekly/future scope. Draft edits remain inactive until saved. Failed saves retain changes for retry; concurrent edits require reopening with the current revision. Account deletion removes the profile.

For household plans, the actor's own allergies always apply, plus allergies explicitly shared by current members. Private plans use only the actor's profile. Queries authorise the selected space before aggregating profiles and return combined IDs without attributing another person's private profile. Leaving a household removes that member's contribution immediately.

Guests keep a validated, bounded list in device-local storage under `foodedo:guest-allergies:v1`; they never create personal Convex documents. Storage failures prevent a success claim. Guest saves compare the original local snapshot so a stale panel cannot overwrite selections saved in another tab. Guest allergies survive refresh and sign-in. An empty account can explicitly save the carried selections; an existing account can add the device selections in the same panel before saving. Existing account allergies are never silently replaced. Only adopted guest selections are cleared after a successful account save; remaining selections and newer changes from another tab stay on the device. Device-local storage is temporary and unsynced, not an identity or cloud backup.

## Matching and planning

`src/lib/domain/allergies.ts` is a React-free deterministic module shared by client and backend. Its initial reviewed vocabulary supports milk, eggs, peanuts, tree nuts, wheat, fish, crustaceans, molluscs, soya, sesame, celery, mustard, lupin, sulphites and garlic. Additional allergies require reviewed terms and matching tests, not free-form storage or an AI guess.

Whole-token/phrase matching covers selected derivatives and aliases. Explicit alternatives are handled narrowly: coconut milk does not imply dairy; peanut butter still implies peanuts; lactose-free milk still implies milk. Possible ingredients (for example pesto, generic flour or an optional ingredient in a note) are tracked separately. Titles and method prose never establish absence. No inference can establish cross-contact risk or a packaged product's actual composition.

Catalogue summaries and saved-plan slot projections expose derived `allergenIds` and `possibleAllergenIds`. These are computed from that exact recipe revision, not stored editorial safety claims. Personal recipe cards derive the same evidence from their ingredient lines. Changing allergies reactively updates warnings without rewriting recipes, slots, plan timestamps or shopping lists.

New automatic suggestions omit both identified matches and recognised relevant uncertainty. The client filters the candidate pool for guest/account local plan drafts; the backend filters its shared candidate pool for automatic swaps, replans and added days, including eligible personal imports. Historical/readable meals stay available so existing drafts do not disappear. A fully filtered pool does not fall back to conflicting meals. Explicit manual recipe choices remain user decisions and carry warnings, including in the normal swap picker. Guest drafts keep a separate set of current selectable recipes so explicit choices do not contaminate the filtered automatic pool. Older pinned revisions remain readable when another revision is chosen. Reviewed draft acceptance does not rewrite choices when the allergy profile changes.

Matching is bounded assistance. Unrecognised synonyms, brands, incomplete imported ingredients, unlisted derivatives and cross-contact can be missed. Missing summary evidence is ineligible for automatic suggestions when allergies are selected. There are no “safe” badges or medical guarantees.

## Warnings and boundaries

The management panel displays: “Foodedo checks the ingredient information available to us, but may miss allergens. Always check ingredients, product labels and cross-contact risks.” A short reminder remains visible with its save action and saved planning entry.

Home identifies affected recipes in one compact notice. Existing Week rows and the two-column Recipes grid receive small text/icon warnings. Recipe details show a notice above Ingredients and mark affected authored rows with a warning icon and text. Existing controls and layouts remain in place. Ambiguous ingredients say “Check for”; identified ingredients say “Contains”.

Saving allergies never replaces meals, regenerates a plan, changes shopping items, or opens a custom affected-meal workflow. Users can use the normal swap controls. Broader exclusions, intolerance/clinical taxonomies, recipe-list hiding and advanced preferences are separate future work.

## Verification

Domain/backend coverage includes aliases, alternatives, token boundaries, uncertain ingredients, unauthenticated/household access, opt-in sharing, leaving, stale revisions, filtered personal/catalogue candidates, empty candidate pools and unchanged plan/shopping documents. Browser coverage exercises multi-select, unsupported search, pending edits, explicit guest saves, retry/sharing, recipe badges/ingredient marks, clear-search touch targets and a short mobile viewport. Both web and Capacitor static-export builds remain required.
