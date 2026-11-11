# Image delivery and transformation usage

## Current policy

Web recipe images continue to use Next/Image and Vercel optimization. Originals
can be large, so do not globally enable `unoptimized` to reduce transformation
usage. The packaged iOS build uses a custom loader to request the same optimized
variants from `NEXT_PUBLIC_SITE_URL` (default `https://www.foodedo.com`). It stays
a static export; it does not need a local Next.js server. Keep this origin paired
with the native build's Convex deployment: the web optimizer only accepts its
configured storage host. For development against a different Convex deployment,
use a reachable web deployment configured for that backend. Production iOS already
requires an explicit public HTTPS site origin through its release checks.

Welcome/dashboard photography stays local in the native bundle. Blog images
continue to use their dedicated Sanity loader. Explicitly unoptimized admin
previews retain their original behaviour.

`next.config.ts` restricts generated widths to 64, 128, 256, 384, 640, 828, 1200
and 1920 pixels (eight variants instead of the installed Next.js defaults' 15).
These cover small plan thumbnails, recipe cards and the roughly 700px detail
hero, including high-density phones. Quality remains 75 and the optimized format
remains WebP; explicitly allowing one of each avoids multiplying variants.
Each image's existing `sizes` still tells browsers which candidate to request.

The minimum optimized-image cache lifetime is 31 days. Convex image replacements
receive new storage IDs/URLs, so revisions can appear immediately without cache
invalidation. Replace a local image's URL or use a content-hashed static import
when changing its bytes; there is no optimizer cache purge in this workflow.

Blog images use Sanity's CDN directly through `BlogImage`, retaining responsive
srcsets, editorial crops, format negotiation and lazy loading. See [blog](blog.md).
Admin proposal previews already bypass optimization.

## Investigation — 9 November 2026

Read-only requests to the public production `/recipes` and `/blog` pages confirmed
that both recipe originals and already-transformed Sanity images were going
through `/_next/image`. Their fallback `src` requested width 3840, even for cards.
The default responsive width list also allowed 2048 and 3840px variants.

One sampled recipe original was a 7,175,671-byte PNG. Its Convex response already
advertised `Cache-Control: private, max-age=2592000` (30 days). The minimum TTL
change is therefore a floor, not evidence of a large cache saving: actual
Vercel cache behaviour and usage must be measured. A sampled Sanity index image
was already resized to 800 × 500 before Vercel received it.

No Vercel account usage or billing data was available through the connected tools,
and the checkout had no linked `.vercel` project. These observations identify
avoidable work, not which project or image caused the account's reported limit.

## Investigation and fix — 11 November 2026

The 9 November change did not disable recipe optimization on web. The production
`/recipes` HTML still advertises responsive `/_next/image` candidates. However,
the native build's pre-existing global `unoptimized: true` bypassed all resizing,
format conversion and responsive candidates, including for tiny plan thumbnails.
It also bypassed custom image loaders. Reverting the November change would not
have fixed this native path.

A fresh public production sample measured the same source at 7,175,671 bytes
(PNG) versus 37,956 bytes at width 640 and quality 75 (WebP), about 189 times
smaller. The optimized response returned HTTP 200, `x-vercel-cache: HIT`,
`Cache-Control: public, max-age=2678400, must-revalidate`, and `Vary: Accept`.
The original returned `Cache-Control: private, max-age=2592000` and
`cf-cache-status: DYNAMIC`. These headers do not prove that iOS never caches;
no physical-device relaunch trace was available. Large original transfers and
decodes are confirmed, while device cache persistence still needs device QA.

Native images now use the web optimizer with stable URLs and the same bounded
widths/quality. Normal HTTP caching applies on device, and the Vercel cache can
serve resized bytes even if WebKit evicts its local copy. There is no automatic
fallback to multi-megabyte originals. This intentionally adds native requests to
Vercel image usage. No backend migration or paid account change is required.

## After deployment

Compare Vercel Usage/Observability for the affected project over comparable periods:
transformations, cache reads/writes, traffic and source URLs. Blog image requests
should go directly to `cdn.sanity.io`; recipe requests should use the bounded
width list. Check cache HIT/MISS/STALE responses as well as total transformations.
Existing cached pages/tabs may still request old candidates until refreshed.
For iOS, install a new native build containing this loader; a website deployment
alone cannot update the packaged JavaScript. On a physical iPhone, inspect recipe
cards, plan thumbnails and detail heroes, then force-quit and reopen. Remote
images should request HTTPS `/_next/image` variants rather than Convex originals;
verify transfer sizes, device cache reuse and CDN HIT responses separately.
The configuration cannot reset an already-consumed monthly allowance. Old and
new widths overlap to reuse existing cached variants where possible.

If recipe processing remains significant, the next architectural step is to
produce compressed thumbnail/card/detail variants once during generation/import,
retain the original, and backfill existing assets. That requires coordinated
storage, cleanup and client changes, and could remove the native dependency on
the web optimizer. No image regeneration, storage migration or backend deployment is
part of this change.
