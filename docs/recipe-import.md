# Recipe import: Foodedo normalization (v12)

## Goal and boundaries

Imports create clear, useful Foodedo recipes, not exact publisher transcriptions. URL and pasted-text inputs use the same typed AI-first normalization contract. JSON-LD is supporting evidence and never bypasses AI. Existing recipes, catalogue meals, planning and shopping contracts are not migrated.

## Processing

1. Source adapters acquire bounded readable evidence, headings, structured support, attribution and image candidates. URL fetching retains DNS/socket SSRF protection, redirect revalidation, body limits and dispatcher cleanup. Pasted lines retain their positions. Whole-block budgeting protects readable recipe regions and core structured evidence before article narrative. Selection is priority-based but final blocks retain authored order, including repeated component rows. Omission diagnostics count towards the context budget; truncated supplementary content does not invalidate complete recipe content.
2. A whole-recipe normalization call selects one coherent primary recipe. A second completeness/correction call sees the same source, formatted proposed recipe and proposed issues. It returns only typed changes plus unresolved actionable issues—not a duplicate recipe or veto findings. Empty changes preserve the original typed content and provenance. Ingredient, step and note changes splice individual rows using zero-based original positions; unchanged rows, order and component groups survive untouched. Metadata changes explicitly replace or clear a field. Duplicate fields, overlapping edits and out-of-bounds positions are malformed and use the existing shared recovery budget. The merged recipe receives the same deterministic validation and acceptance as before.
3. One shared recovery allowance handles malformed structured output or substantial recoverable defects. At most three calls run within the existing 110-second processing deadline and 120-second watchdog. Provider retries are disabled. Prompts live in a dedicated module; role configuration remains centralized and all roles retain `openai/gpt-5.4` with low reasoning through the injected client. Moving the prompts did not change their text. Malformed-output recovery receives bounded field paths/codes, never raw responses. Every attempted call emits outcome, duration and available token usage, including failures. Unknown usage is explicit, not measured zero; job-scoped logs correlate calls and source/normalization/persistence timings.
4. Deterministic formatting and structural checks enforce durable content bounds, valid amounts, unique IDs and resolved note references. Missing method references use the existing recovery allowance; if still unresolved they retain an actionable draft unless the model explicitly classifies that method link as nonessential. Optional ingredient-note links remain nonblocking warnings. No regex/source-token matching, mandatory measurement confirmation or exact timing arithmetic remains.
5. Usable recipes are committed atomically with the job transition. Image copying remains asynchronous, independently SSRF-protected and fingerprint-guarded; image failure never blocks saving.

Parallel ingredient/method processing is not shipped. Benchmark it against this coherent baseline before adoption: it must retain accuracy and demonstrate a latency improvement. Future rendered-page/transcript adapters can supply the same evidence contract. No rendering service, video/social integration or OS/push notification infrastructure is introduced.

`pnpm eval:recipe-import --benchmark-parallel --case=id,...` is an evaluation-only experiment: it runs typed ingredient and method extraction concurrently, then uses the same correction and acceptance. It re-keys section-specific note references and enforces the same maximum of three underlying model calls. Compare its independently asserted accuracy, latency and cost with the normal run; it is never selected by application jobs.

## Measurements and inference

The internal amount union represents exact, range, package, qualitative and unspecified quantities. One formatter writes `quantity`, `unit` and `amountText`. Normalize ingredient identity and meaningful size/variety separately from preparation; use consistent UK names and existing shopping categories.

Mass normalizes to grams and volume to millilitres. Prefer published metric equivalents; convert weight-only lb/oz using exact international factors with three significant figures. Convert kg/l without density assumptions. Cups and spoons remain unless a published metric equivalent exists. Package counts and sizes survive. Shared EACH quantities become separate lines; repeated component ingredients stay separate. Meaningful alternatives and recipe notes remain available.

Qualifiers stay attached to their original measurement: a published equivalent for `1 packed cup` renders as `200 g (1 packed cup)`, not `200 packed g`. The normalization version is defined once in the shared import contracts and used by both automatic completion and draft finalization. Existing saved recipes are untouched.

Never invent ingredient quantities, method actions, temperatures or safety instructions. Missing amounts stay unspecified and editable. Infer factual titles/descriptions, plausible servings and summary times where supported. Summary timings may differ from publisher totals or rounded method sums; 21 minutes against a published 20 is not grounds for rejection. Provenance distinguishes published, derived and estimated values. Scaling remains source-only unless every relevant amount is supported by existing scaling behavior.

## Outcomes and private drafts

- Usable recipe: save automatically. Optional metadata, image absence, wording, rounding and nonessential notes cannot veto saving.
- Recognizable but incomplete recipe: `awaiting_input`, with recovered bounded draft content outside the library and specific actionable issues.
- No usable source: explicit transport/access, non-recipe, AI availability, malformed-output or deadline failure, with retry and paste-text recovery. Legacy jobs remain readable.

Metadata and notes issues are forced nonblocking in code, regardless of model advice. Only unavailable essential ingredients or unusable/unsafe essential instructions require draft review. Structural/schema failures receive the same single recovery allowance; never fall back to unnormalized source-shaped recipes.

Confirmed `partial_coverage` after correction proceeds directly to a draft: the source cannot supply that essential content and a third reread adds delay without new evidence. Malformed output, structural failures and substantial recoverable conflicts retain the single recovery allowance. A flavouring's unspecified use does not turn a brief actionable method into an incomplete recipe.

Drafts are owner-private and expire seven days after staging; edits do not silently extend that expiry. Users can edit ingredients/method/metadata, save their draft, acknowledge corrected core issues, or append source text and resume the same job. Updates enforce attempt and revision guards. Finalization checks required content and acknowledgements and atomically creates one recipe; replay returns its existing ID. Owner edits use conservative source-only scaling. Job routes remain resumable and preserve authentication resume.

Resuming retains the last structured draft and its original expiry while processing. Failure/timeout leaves that snapshot editable; the owner can retry, append new text, or finalize after resolving issues. Additional text is retained separately from the snapshot, so retries include the latest saved edits. Resumed evidence labels previous metadata provenance and keeps note IDs/relationships. Unchanged metadata deterministically retains its previous provenance, including owner-edited values without AI provenance. Only a successful replacement or finalization discards the prior snapshot/input; expiry cleanup also applies to failed retained drafts.

## In-app completion feedback

The import screen invites users to continue using Foodedo. A single app-shell observer subscribes to the latest 20 owner-private job summaries, not full retained recipe/source content. Completion produces a persistent toast with **Open recipe** and **Dismiss**; drafts/failures offer **Review import**. These toasts have infinite duration and remain across route navigation. They do not auto-navigate or introduce OS permission prompts.

A small versioned, account-keyed local ledger remembers the observation baseline and up to 80 acknowledged outcome keys for seven days. It stores IDs only, no source/recipe text or credentials. Acknowledged results do not reappear on navigation/reload; new attempts and a finalized draft can notify again. Historical completed imports do not trigger an initial toast storm. Storage failures fall back to in-memory handling, and account switches remove the previous account's visible toasts. Pending account synchronization returns an empty subscription rather than breaking unrelated screens.

This is foreground/in-app feedback, not a system notification while the app is closed. Unread recent outcomes can surface when returning to the app. See the [speed review](./recipe-import-performance.md) for measured bottlenecks and optimization results.

Only normalized draft content, actionable issues and bounded provenance are persisted. No raw HTML or full model responses are stored. Pasted input is cleared after staging/completion; failed attempts retain bounded retry input until normal job expiry.

## Evaluation and rollout

Unit tests inject clients and do not contact AI services. Test schema recovery, the three-call limit, correction of substantive omissions, relaxed timing, missing amounts, component groups, package formatting, non-recipes, provider outages, truncation, authentication and downstream display. Convex tests cover ownership, retained drafts, revision conflicts, expiry, resumed attempts and atomic/idempotent finalization, alongside existing jobs/images.

The live corpus asserts ingredient identities/amounts and meaningful cooking actions, temperatures and durations independently. Quantitative expectations use typed measurements or complete amount expressions, never numeric substring matches (`500 ml` must not accept `1500 ml`). Counted nouns in ingredient identity and equivalent container spellings compare semantically without hiding changed counts or sizes. Summary-time assertions use plausible tolerance, not exact transcription or total reconciliation. `pnpm eval:recipe-import --case=id,... --repeat=3` also compares fixture-selected measurements, shopping categories and fixture-declared component relationships across runs while permitting prose and optional inferred group changes. Failed calls count towards telemetry; incomplete usage/pricing marks cost estimates incomplete. Never commit credentials; pricing configuration enables cost reporting.

Before explicit V2 development sync, run format, lint, typecheck, unit/Convex tests, web and iOS builds, the complete corpus and repeated reported URLs. Report transport failures separately and inspect a fresh authenticated saved recipe through Detail/Cook/Plan/Shop. Target typical imports below 30 seconds and p95 below 60, without weakening correctness. No production deploy or existing-recipe migration.

## Cook timer consistency

URL and pasted-text imports populate the same step `timerCues` metadata as generated recipes. Normalization, correction and recovery use one shared timer schema and authoring policy. Conversion, row corrections, draft completion and personal editing retain cues; Cook consumes the stored metadata without parsing prose at runtime. Both import editors allow per-step timer corrections in minutes and seconds.

Explicit actionable cooking, preparation, resting and chilling durations, including directly referenced method notes, receive concise cues. Ranges use the earliest check time; per-side/per-batch cues time one side/batch. Keep full instructions and doneness guidance. Never infer a step timer from a recipe summary, unrelated prose or an untimed instruction. Probe hold times are not cooking-completion timers. Durations must be positive whole seconds up to 24 hours; longer waits remain in prose. Missing or ambiguous timing metadata remains nonblocking and must not invent source instructions. Historical personal imports remain unchanged. No additional model call is added.

The corpus includes readable-only and structured-only timing fixtures and independent `expectedTimers` (step pattern, label pattern and seconds) plus `expectedNoTimers` assertions. Evaluation reports `timerCoverage`; missing, misplaced or incorrect expected cues fail semantic preservation. Run `pnpm eval:recipe-import --case=timers-readable,timers-structured,pasted-leek-linguine,complete-json-ld` with the existing Gateway credentials to inspect live output.

### Minimum servings

Normalization and correction assess optional `minimumServings`, independently of authored yield. Infer it only when the method/equipment establishes a practical lower size; use null for ordinary recipes or uncertainty. It must be a positive whole number no greater than known servings. Inconsistent optional model enrichment is discarded rather than preventing a usable import. Published/derived/estimated provenance is preserved through correction, draft editing and recovery; culinary estimates are labelled as estimated. Owner changes clear that field's inference provenance.

Imported-recipe and draft editors expose **Minimum servings**, with blank allowing ordinary scaling. Detail, Cook and Shopping use one shared serving model; quantity interpretation safety (`source_only`) takes precedence over minimum adjustment.
