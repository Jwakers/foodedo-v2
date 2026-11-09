# Image delivery and transformation usage

## Current policy

Web recipe images continue to use Next/Image and Vercel optimization. Originals
can be large, so do not globally enable `unoptimized` to reduce transformation
usage. The packaged iOS build retains its existing static-export behaviour.

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

## After deployment

Compare Vercel Usage/Observability for the affected project over comparable periods:
transformations, cache reads/writes, traffic and source URLs. Blog image requests
should go directly to `cdn.sanity.io`; recipe requests should use the bounded
width list. Check cache HIT/MISS/STALE responses as well as total transformations.
Existing cached pages/tabs may still request old candidates until refreshed.
The configuration cannot reset an already-consumed monthly allowance. Old and
new widths overlap to reuse existing cached variants where possible.

If recipe processing remains significant, the next architectural step is to
produce compressed thumbnail/card/detail variants once during generation/import,
retain the original, and backfill existing assets. That requires coordinated
storage, cleanup and client changes, and would also reduce iOS original-image
downloads. No image regeneration, storage migration or backend deployment is
part of this change.
