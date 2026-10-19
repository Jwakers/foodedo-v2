# Normalization v10 verification — 7 October 2026

## V11 speed pass

All 19 complete local fixtures passed on the final correction contract, along with the genuine non-recipe outcome. The incomplete chicken fixture initially exposed omission of useful draft notes; after the focused note correction, three repeats retained the notes and stayed drafts in two calls (24–33 seconds), rather than rereading the source a third time. Missing estimated prep time also passed three targeted repeats. The four reported accessible URLs were exercised repeatedly three times each; a Borough note-location assertion was separately inspected and retested successfully. Earlier failed experimental samples are not counted as successful release results; see [performance review](./recipe-import-performance.md).

V11 retains GPT-5.4/low reasoning, secure fetching, deterministic measurements, independent source checking and bounded recovery. A faster `none` reasoning experiment was discarded. Corrections only emit actual row/metadata changes; confirmed missing source content proceeds directly to an editable draft. Existing saved recipes are unchanged.

Final checks: 178 unit tests, 80 Convex tests, formatting, lint, typecheck, web build and iOS web build passed. No authenticated browser session was exposed for a fresh saved-recipe/device walkthrough; that verification remains outstanding. No production deployment or commit is included.

This is development verification, not production release approval. Existing recipes were not migrated. No commit or production deployment was performed.

Verified functions were synced with `pnpm exec convex dev --once` to V2 development `bold-walrus-818`. V1 and production were not touched.

## Automated checks

Formatting, lint, typecheck, 163 unit tests, 79 Convex tests, web build and iOS web build passed. Backend tests include owner-private drafts, revision conflicts, expiry, resumed/stale attempts, atomic saving and duplicate finalization. The 20-versus-21-minute checker disagreement saves successfully.

## Live AI evaluation

The final local corpus run passed all 21 cases: 19 complete recipes became usable, one genuinely incomplete recipe became an actionable draft, and one non-recipe failed clearly. The pasted Waitrose recipe passed; its URL separately returned `source_unreachable` before any model call.

Each accessible reported URL passed three final semantic/measurement checks:

| Recipe                              | Three-run latency range | Calls/import | Estimated cost/import |
| ----------------------------------- | ----------------------- | ------------ | --------------------- |
| RecipeTin coconut chicken curry     | 49–53 s                 | 2            | $0.130–0.134          |
| Smitten Kitchen sheet-pan chow mein | 47–54 s                 | 2            | $0.086–0.094          |
| Don't Go Bacon My Heart chilli      | 56–61 s                 | 2            | $0.146–0.151          |
| Borough Market chicken shish        | 37–43 s                 | 2            | $0.086–0.089          |

Checks assert important ingredient identities/amounts, component groups, method actions, temperatures, durations and note resolution—not identical wording. Early runs exposed overly literal ingredient-name assertions and a duration carried in a referenced method note; those assertions were corrected after output inspection. Unreferenced notes cannot satisfy method coverage. Actual prep-duration loss and per-item weight confusion were addressed in the shared normalization policy. The incomplete old chicken fixture retains draft expectations; a complete multiple-method counterpart independently checks safe primary-method selection.

The local batch had a median of 12 s and p95 of 35 s (including deliberate failure/draft cases). Large URL imports remain slower: the measured p95 was about 61 s, slightly above the 60-second target. These are small samples, not an SLA. Costs assume uncached input at $2.50/million tokens and output at $15/million tokens; they are estimates, not billing reconciliation.

## Parallel experiment

Evaluation-only ingredient/method splitting passed three fixtures. Versus the coherent baseline, pasted Waitrose improved from 31 to 25 s, compound ingredients from 28.3 to 27.9 s, while the complete multiple-method fixture worsened from 18.9 to 19.6 s. All used three calls instead of two and cost more. This does not establish a consistent benefit; application jobs keep whole-recipe normalization and correction.

## Remaining manual verification

The available local-browser session was signed out. An authenticated fresh import and inspection through Detail, Cook, Plan and Shop remains outstanding. Normalization/formatting and persistence are covered by automated/live checks, but those are not substitutes for this real authenticated UI check.
