# TikTok recipe import

## Scope and configuration

TikTok uses the existing server-only `APIFY_API_TOKEN` on V2 Convex. There is no separate enable switch, account, demand table or import workflow. Missing credentials return `tiktok_unavailable`; provider access failures remain source failures. Never put the token in browser/native bundles or `NEXT_PUBLIC_*` variables.

Public `tiktok.com`, `www.tiktok.com` and `m.tiktok.com` post URLs (`/@creator/video/ID` and `/@creator/photo/ID`) are canonicalized without tracking parameters. `vm.tiktok.com`, `vt.tiktok.com` and `/t/CODE` share URLs use the existing bounded, DNS/socket-protected HTTP fetcher to resolve to a verified direct post URL before any paid run. JavaScript-only redirects may remain unavailable. Profiles, searches, live streams, other subdomains and unsupported paths are rejected.

This phase reads captions, optional shared text and explicit recipe-page links. It does not analyze video, audio, subtitles, slideshow pixels, comments or profile bios. An ingredient list with missing instructions can become the ordinary editable draft. Source-access failures, absent caption fields, unknown media types and unvisited bio/comment references are never counted as proof that a recipe is video-only. Known accessible videos lacking written recipe evidence use the shared coming-later message and the marker on `recipeImports`.

## Shared architecture

- `apify.ts` handles authenticated transport, bounded responses, run lifecycle, read-only retry and cancellation for Instagram and TikTok.
- The Instagram and TikTok adapters own their URL rules, fixed Actor inputs, returned-post identity checks and response validation.
- `socialSource.ts` combines written evidence, ranks/fetches up to three recipe-page links using the ordinary website extractor, preserves publisher/creator attribution and produces the existing `RecipeSourceCandidate`.
- All sources use the same normalization/correction, draft review, save, retry, notification and outcome-retention logic.

TikTok uses `clockworks/tiktok-video-scraper`, one explicit post URL, related scraping disabled, video/cover downloads disabled and `NEVER_DOWNLOAD_SUBTITLES`. The dataset request flattens only `authorMeta` and `videoMeta` before selecting post identity, caption, media flag, limited creator/cover fields and typed error fields. Without flattening, Apify silently omits the nested fields. No raw provider response is persisted. The post ID and returned canonical URL must match; private or explicitly truncated responses are rejected. Unknown slideshow status remains unknown rather than defaulting to video.

Both Apify adapters have a 40-second remote run timeout, $0.05 maximum Actor charge and one-result cap. Acquisition has 45 seconds; shared normalization gets at most 110 seconds within a 165-second processing budget and 180-second watchdog. These are application limits, not a guarantee of provider reliability or an account-wide spending cap. Paid run starts are not retried automatically. Complete matching data from timed-out runs must pass the same validation as successful runs; active abandoned runs are cancelled.

Provider references: [Actor input](https://apify.com/clockworks/tiktok-video-scraper/input-schema), [Actor output](https://apify.com/clockworks/tiktok-video-scraper/output-schema), [dataset field selection](https://docs.apify.com/api/v2/dataset-items-get).

## Native capture

The existing share extension accepts website, Instagram, TikTok and YouTube URL/text payloads. It prefers a single social-post identity over publisher URLs accompanying its caption, rejects ambiguous multiple social posts, and deduplicates TikTok tracking variations. Short links and their resolved direct URLs cannot be deduplicated against one another offline. Capture remains local; open Foodedo to import and sign in at the existing persistence boundary. Both native targets still require the configured App Group and appropriate Apple provisioning for device testing.

## Verification

Run `pnpm test:convex`, `pnpm test:unit`, `pnpm test:ios:inbox`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm build:ios:web`. Unsigned simulator compilation additionally checks the native app/share extension; it does not establish device provisioning or real TikTok payload behaviour.

`pnpm eval:social --manifest=PATH --one-round` runs a small reviewed diagnostic manifest against the internal `socialImportEvaluation:probe`, using the real acquisition and shared normalization functions without creating jobs or recipes. This starts paid work; choose a spending cap before running it. Add `--acquisition-only` to skip model calls. `pnpm eval:instagram` remains an alias for the same harness and accepts the existing Instagram corpus.

Full release cohorts remain platform-specific: at least twenty independently reviewed supported sources in a 32–40-case corpus, two acquisition rounds, verified ingredient/method checks and negative cases. The harness distinguishes caption acquisition from verified usable recipes; small/single-round diagnostics cannot qualify a release. Live TikTok acquisition, short-link latency and signed-device share payloads require verification separately from mocked tests. Existing Instagram reports remain historical; no TikTok success rate is inferred from them.

## November 6, 2026 live smoke checks

The [recorded checks](./evaluations/tiktok-smoke-2026-11-06.json) cover three distinct TikTok videos and one existing Instagram regression source. The complete gnocchi caption produced a usable recipe with all eight declared ingredient quantities and key method checks retained. The incomplete spaghetti caption became a draft with a blocking method issue; the non-cooking post returned `no_recipe`. Successful acquisition calls took about 5–9 seconds in this sample. The Instagram source retained all declared caption fragments. No recipes or import jobs were created by the evaluation.

Live testing exposed and corrected the nested creator/privacy/cover projection issue. The tested TikTok short link redirected to the homepage and was correctly rejected before starting a scraper. A valid live short link, slideshows, publisher-linked TikTok sources and real-device payloads still need verification; these checks do not qualify a general reliability claim. All seven provider runs finished. Measured Apify charges were $0.0207; model token usage at published uncached rates gives a combined estimate of $0.15883, below the approved $2 cap.
