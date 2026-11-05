# Instagram recipe import

## Configuration and supported content

Instagram import is available when `APIFY_API_TOKEN` is configured on the Convex deployment. The provider checks its credential directly; there is no separate enable switch. Keep the token on the server, outside `NEXT_PUBLIC_*`, browser bundles and the iOS extension. V2 development is configured; configure other deployments deliberately through the normal release process.

Public post, Reel and carousel captions, optional shared text and explicit recipe-page links feed the shared normalization/correction/draft/save pipeline. Captured text supplements a fetched caption; it does not hide provider access failures. Explicit `https://`, `http://` and `www.` recipe links are supported. Profile bios, comments, DMs, private content, OCR and video/audio analysis are outside this implementation.

Canonical post/Reel/legacy-TV paths, username-prefixed paths and tracking parameters normalize to the post identity. Share links use bounded protected HTTP redirect resolution; JavaScript-only redirect pages may fail. Up to three ranked publisher links use the existing DNS/socket-protected website fetcher. Publisher recipes retain publisher attribution and images; caption recipes retain the canonical Instagram URL and creator. Original shared URLs remain separately on owner-private import jobs.

## Provider and processing safeguards

Apify uses a fixed authenticated HTTPS endpoint, rejects redirects, requests one target/result and validates the returned URL, shortcode, media type and completeness flags. Foodedo selects only the caption, identity, attribution, image and error fields from the dataset; it does not download comment/video metadata. See [Apify dataset field selection](https://docs.apify.com/api/v2/dataset-items-get).

Each remote run has a 40-second timeout and $0.05 Actor charge cap. Source acquisition has a 45-second deadline. A transient read may be retried once within that deadline; paid start requests are never automatically retried. A complete matching dataset record from a timed-out run can be recovered only through the same validation as a successful run. Active runs are cancelled after abandoned/expired attempts; terminal runs need no additional abort request.

Normalization has at most three model calls and 110 seconds, within a 165-second Instagram processing deadline and 180-second watchdog. Other URL/text imports retain their existing deadlines. Schema additions are optional, existing jobs/intents remain readable and existing recipes are not migrated.

Acquisition diagnostics contain provider/outcome, media type, caption character count, shared-text presence, link attempts, access incompleteness and duration. They do not retain raw captions or provider responses. Missing credentials, access failures and rate limits remain acquisition failures, never video-only demand signals.

## Partial recipes, recovery and demand tracking

Written ingredient quantities trigger bounded recovery before accepting a non-recipe/video-only model response. Missing essential instructions remain blocking in an editable draft; Foodedo does not invent them. Written quantities also suppress a video-only signal if the model still rejects the source.

An apparent video-only recipe requires trusted accessible video evidence, a complete caption and no unresolved linked-content access. References to recipes in a bio, comments or DMs suppress that classification because those sources have not been read. Image/carousel and unknown or truncated evidence cannot be classified as video-only. An accessible Instagram video with no caption/shared text can receive the unsupported-video outcome without a model call. The user message says video-only importing is coming later and offers written-text/direct-link recovery.

Demand lives on `recipeImports`, alongside the existing `status`, `failureCode`, platform and attempt number. `videoOnlyFirstDay` preserves the video-only signal if a retry or pasted-text recovery changes the final outcome; `resultRecipeId` identifies successful recovery. There is no separate daily counter table or reporting API. Seven-day cleanup removes source URLs, pasted/shared text, provider diagnostics and drafts, retaining the small outcome record. Cleaned-up jobs are hidden from import screens and notifications and cannot be resumed. Counts can be derived from these records when reporting is needed.

Pasting recipe text resumes the same owner-private failed job with attempt guards and idempotency, preserving original attribution and demand lineage across refresh/authentication. The failure page offers a new link first, pasted text second, and a quiet retry only for potentially temporary failures. Starting over clears the form and recovery URL parameters without deleting historical jobs. Ready notifications are acknowledged when the matching recipe is opened independently in Detail or Cook mode.

## Repeatable evaluation

The maintained corpus is `tests/fixtures/instagram-reliability-corpus.json`: forty distinct cases, including twenty reviewed caption/linked sources, partial captions, media/bio references, unavailable sources and invalid routes. Independent archived/publisher references establish content facts; current Instagram accessibility is tested separately. Genuine acquisition failures are retained, not relabelled to improve the score.

```sh
pnpm eval:instagram --manifest=tests/fixtures/instagram-reliability-corpus.json
```

This explicitly starts paid provider/model work from V2 Convex, with no recipe writes. Two separate acquisition rounds run at most two probes concurrently. The first also runs shared normalization/correction and checks declared ingredient quantities, method facts and minimum content counts. Normalization is capped at three calls and 6,000 output tokens per call. Review current pricing before running a large cohort; usage counters report input/output tokens and whether usage is complete, without hard-coded dollar estimates. Provider caps remain per run, not an account-wide spending limit.

Use `--one-round --case=POST_ID,...` for focused regression checks; a selected/single-round run cannot qualify a release. The internal `instagramImportEvaluation:probe` is a developer-only benchmark, never part of the user import path. It calls the same Instagram acquisition and shared normalization functions without creating jobs or recipes. It accepts only Instagram cases and optional verification/normalization. Temporary publisher-only diagnostics, ingredient dumps and investigation-specific pricing controls have been removed.

Source latency, total processing time and harness wall time are separate. Unknown transport latency is null rather than an invented duration. CLI deadlines include overhead (90 seconds acquisition-only, 210 seconds with normalization) without extending production deadlines. Both supported acquisition and verified usable-recipe success must reach 90%; acquisition p95 must be <=45 seconds, with no wrong-post/configuration/transport or negative-case failures. Selected fact checks are not an exhaustive culinary audit, and twenty supported sources remain a small stratified sample.

## Recorded results

The November 4, 2026 records are historical snapshots; their diagnostic options and captured pricing are not current configuration.

- [Initial acquisition-only pilot](evaluations/instagram-apify-2026-11-04.json): 21/24 supported attempts (87.5%). It included a no-longer-accessible post and harness errors. Its [archived corpus](evaluations/instagram-acquisition-corpus-2026-11-04.json) is retained for provenance, not as input to the current harness.
- [Expanded audit](evaluations/instagram-reliability-2026-11-04.json): 39/40 supported acquisitions (97.5%), 33.699-second p95, no harness or wrong-post failures. Its initial 15/20 recipe-fact score included three evaluation budget stops and two checks requiring review. The raw failures and pre-registered snapshot are retained.
- [Fresh follow-up](evaluations/instagram-followup-2026-11-04.json): all twenty supported sources acquired and returned usable output; eighteen passed the original fact checks immediately. The partial pancake caption became an editable draft under normalization version 15.
- [Focused fact review](evaluations/instagram-fact-review-2026-11-04.json): confirmed the authored one-head cauliflower quantity and verified 2 tsp cornflour as the UK name for the source's corn starch. Original scores were not silently overwritten. A separate Instagram retry timed out; publisher-only diagnostic success was not counted as acquisition success. Budget accounting remains in this report.

The old and expanded percentages use different cohorts and are not directly comparable. A publicly accessible chickpea-popcorn post still timed out in both acquisition rounds. Development testing remains useful; occasional provider failures, broader production evidence and signed-device share verification remain outstanding.

## iOS share-in

`RecipeShare` is embedded in the iOS app. Both targets use App Group `group.com.foodedo.app.imports`; register/provision that group for both identifiers under the existing Apple development team before signed device distribution. It captures URL/text locally and says **Captured — open Foodedo to import**. It stores no authentication credentials and does not force the main app to launch.

The coordinated App Group file holds up to twenty FIFO captures, with seven-day expiry and tracking-insensitive Instagram deduplication. Full/corrupt/unavailable inboxes fail visibly without replacing saved data. Read/modify/write transactions are coordinated, writes are atomic and iOS file protection is applied. A capture binds to the account that starts it and is acknowledged only after idempotent server acceptance. The server checks the expected authentication subject against account-switch races. Guest captures remain on device and offer sign-in; existing auth continuations and active imports take precedence.

```sh
pnpm test:ios:inbox
```

The tests cover restart, deduplication, ownership, acknowledgement replay, capacity, expiry, Unicode limits, concurrency and corruption preservation. macOS file coordination may require running outside the shell sandbox. Unsigned simulator compilation verifies linkage; signed iPhone tests are still needed for Instagram share payloads, offline capture, termination, account changes and App Group provisioning.
