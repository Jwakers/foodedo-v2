# Importer speed review — 7 October 2026

The initial review below records the pre-optimization baseline. The v11 implementation results follow it. The in-app completion toast improves the ability to continue using Foodedo; it does not reduce processing time.

## Where time goes

One fresh live curry evaluation passed all semantic/measurement assertions in 53.64 seconds:

| Stage                                                      | Time    | Output tokens |
| ---------------------------------------------------------- | ------- | ------------- |
| Whole-recipe normalization                                 | 29.31 s | 2,249         |
| Completeness/correction, returning the entire recipe again | 24.08 s | 2,321         |
| Fetching, preparation and other evaluator overhead         | 0.25 s  | —             |

Both roles used the configured `openai/gpt-5.4`, low reasoning. The two calls accounted for about 99.5% of this evaluation's wall time. This evaluation does not measure scheduler queueing, database saving or browser rendering. Images already copy asynchronously and do not block saving. A single run is diagnostic evidence, not a performance guarantee; earlier three-run URL samples were 37–61 seconds and the local corpus median was 12 seconds.

## Recommended order

1. **Make the correction response change-only.** Keep the whole-recipe normalization call and independent completeness check, but have the second call return typed replacements for affected ingredient/method/metadata sections plus unresolved issues. With no changes it should return a small result, not repeat every ingredient, source ID, note and method step. Apply changes locally, then run the same structural/amount/reference checks and draft acceptance. Preserve the three-call recovery budget. This targets the 24-second second stage without dropping independent checking. Savings must be measured rather than promised.
2. **Benchmark a faster correction role independently.** Keep the primary normalization model while evaluating a faster checker or reasoning setting against the complete corpus and repeated reported URLs. Do not switch merely because it is cheaper/faster; missing ingredients, quantity scope, alternatives, safety actions and durations remain release gates.
3. **Trim redundant source context cautiously.** Preserve whole recipe blocks, repeated groups and meaningful supplementary evidence. Reduce duplicated representations and irrelevant article material only when it is safe; avoid a single-source JSON shortcut or website-specific rules. This reduces input costs, but output generation is the larger latency target.
4. **Keep parallel extraction experimental.** The existing experiment used three calls rather than two, gave inconsistent speed improvements and cost more. It is not a supported replacement yet.

OpenAI's [latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization) identifies generated output as a major latency driver and advises reducing unnecessary output/requests. It also notes that shrinking input often has a comparatively modest effect. That guidance supports prioritizing the duplicated correction output, not removing correctness checks or truncating recipe content.

Before adopting any optimization, compare per-role time, output/reasoning tokens, total latency, p50/p95, cost and independent ingredient/method usefulness. Keep genuine transport/provider failures separate. Model/prompt/schema changes require a new normalization version and the existing corpus/repeatability gates.

## V11 implementation

- Correction returns typed metadata changes or minimal ingredient/step/note row edits, not a second full recipe. Empty changes preserve typed content exactly. Edits use explicit zero-based original indices; code rejects duplicate fields, overlapping/out-of-bounds edits and oversized merged sections.
- The checker receives the full typed proposal, formatted amounts, resolved note references and initial issues. A display-only proposal omitted shopping categories and original amount shapes, encouraging unnecessary re-normalization; retaining those fields reduced corrections substantially.
- Confirmed missing source content (`partial_coverage`) becomes an editable draft after correction, without a redundant third reread. Malformed output, structural errors and recoverable conflicts retain the shared recovery allowance.
- All shipped roles keep GPT-5.4 with low reasoning. A `none`-reasoning checker experiment was quicker, but failed repeated ingredient checks and was discarded. No alternative model or parallel extraction ships.
- The checker can fill reasonably supported missing metadata without rewriting already-good estimates. Conservative `estimated` timing provenance is acceptable; a method-derived estimate must not falsely claim a published summary. The Smitten fixture accepts derived or estimated cooking summaries while retaining bounds and every actionable duration assertion.

The final low-reasoning curry samples are approximately 35–37 seconds, versus the earlier 53.64-second baseline (about a third faster). Sample sizes are small and not paired randomized trials. The evaluator measures fetching and AI processing, not scheduler queueing, persistence, UI or device-network latency. Existing recipes and toasts are unchanged; normalization version is 11.

Exploratory batches exposed and corrected brief-method over-rejection, missing inferred prep time and wording-sensitive `Reserve`/`reserving` assertions. Generic ingredient-count checks now catch accidental duplicate method-only salt/water rows. One exploratory batch had wall-clock deadline overruns above 900 seconds; it was excluded from latency comparisons and rerun. These observations must not be presented as successful release samples.
