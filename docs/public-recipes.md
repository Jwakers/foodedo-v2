# Recipe SEO and the shared app interface

Web and iOS use the existing Recipes interface. There is one list at `/recipes`; web catalogue details use `/recipes/[slug]`. There is no separate editorial catalogue or Discover experience. Web-specific entrypoints seed the shared list and recipe presentation with public data before hydration. Search, filters, saving, planning, household navigation and account features use their existing app implementation.

## Rendering and caching

The server-only adapter in `src/features/public-recipes/catalogue.server.ts` reads the existing public V2 Convex queries without credentials or backend writes. It caches decoded successes using Next's `unstable_cache` and deduplicates render-local reads using React `cache`. Cache Components remains disabled for the shared static-export architecture. Each uncached read creates a fresh unauthenticated SDK client with an uncached transport and 15-second timeout. Cache keys include the deployment and, for details, the slug.

| Surface                                   | Lifetime                                                        |
| ----------------------------------------- | --------------------------------------------------------------- |
| Published detail data and web recipe page | 24 hours (86,400 seconds)                                       |
| Published catalogue listing data          | 30 minutes (1,800 seconds)                                      |
| Web `/recipes?page=n` HTML                | Request-time rendering from cached public data                  |
| Combined web sitemap                      | 60 seconds; recipe entries use the same 30-minute listing cache |
| Blog pages and CMS reads                  | Existing 60 seconds                                             |

Known published recipes prebuild. Unbuilt slugs generate and cache on first request; the direct detail lookup never gates on directory/build-time membership. Negative results expire after 24 hours. Refreshes are demand-driven, not scheduled jobs: a triggering request may receive stale output while regeneration completes. A successful null establishes absence; failures remain errors. Failed revalidation retains successful cached content.

Initial HTML contains public recipe links, ingredients, method, authored timings, servings and structured data. No account or personal data enters the static cache. Public listing snapshots remain stable until navigation/refresh; client-side refinements and personal collections use the existing Convex queries, as do hydrated recipe details; recipe structured data follows the displayed catalogue revision. Account servings preferences and manual controls can scale the display, while recipe markup describes the authored base quantities. This uses existing app queries, not an additional CDN API or persistent device-cache layer.

The shared native list retains its client-loaded static entrypoint and `/recipes/view?slug=…` links. Native content fetching, private recipe handling and links pinned to immutable versions are preserved. New pretty-path entrypoints and server cache code are excluded from Capacitor; no catalogue snapshot is packaged in iOS.

## URLs, metadata and schema

Web catalogue browsing, sharing, internal public links and the web sitemap use `/recipes/[slug]`. The generic `/recipes/view` screen stays available for native, private and pinned links and is `noindex`. Reserved app paths such as `/recipes/import`, `/recipes/edit`, `/recipes/cook` and `/recipes/view` retain their meanings.

Web-only permanent redirects send `/discover` to `/recipes` and `/discover/recipe/:slug` to `/recipes/:slug`, preserving query parameters. The web sitemap includes only canonical recipe URLs. Its recipe list and initial `/recipes` HTML read one shared listing cache. The native sitemap retains its existing query-string destinations. The web listing uses Next.js 16’s async `searchParams` prop: `/recipes?page=2` and subsequent pages render the correct 20 public summaries in their initial HTML and self-canonicalise. Search/filter/sort queries are also applied on the server; refined/private query URLs are noindex. The data cache remains 30 minutes while directory HTML renders per request. Old `/recipes/page/:pageNumber` URLs permanently redirect to query URLs, preserving other parameters. All web pages render the shared Recipes interface with numbered pagination, making the full catalogue crawlable without JavaScript. Native retains Load more. See [Organic discovery](./organic-discovery.md). Recipe modification dates are omitted because the existing summary query does not provide trustworthy dates.

Each public recipe has a title, description, canonical, social image preview and escaped `Recipe` JSON-LD. Images resolve to absolute URLs; ingredient and instruction text uses the shared display formatting. Recipe identity and version describe the displayed revision. Optional values are omitted when unavailable. Google expects `prepTime` and `cookTime` together, so partial timings remain visible in the UI but are omitted from markup rather than completing them with invented values. No ratings, nutrition, authors or dates are fabricated. JSON-LD escaping lives in the shared SEO module, without a dependency on the blog CMS.

`docs/recipe-url-inventory.json` records the 97 legacy recipe URLs read on 22 October 2026 and their canonical destinations. Ninety-six redirect to prebuilt recipes. On 27 October 2026, the owner approved Chicken Tacos with Avocado Salsa as the replacement for the now-missing Chicken Tacos with Salsa; both its legacy Discover URL and V2 recipe URL redirect directly to that replacement. V1 Cottage Pie was explicitly removed in the reviewed migration because it lacked an image (legacy ID `j57awyx0r26fyj7jnepfn48g6h8dz0q4`). There is no confirmed replacement provenance for Classic Cottage Pie with Peas. Its legacy URL therefore redirects to a canonical 404, rather than an unrelated recipe.

Canonical defaults use `https://www.foodedo.com`; `SITE_URL` overrides `NEXT_PUBLIC_SITE_URL`. The server passes the canonical into hydrated recipe schema to prevent server/client environment differences changing it. Production DNS/TLS, hostname redirects, native associated domains and Search Console remain deployment checks; this work does not deploy or configure them. Legacy landing/help/policy URL coverage is documented in [Public URL continuity](./public-url-migration.md).

## Quality checks

- Unit tests cover native versus web browsing paths, reserved routes, query precedence, schema facts, optional fields and escaping.
- Adapter tests cover cache policies, deployment keys, new-slug lookup and error versus absence.
- Browser tests verify every inventoried legacy redirect and destination, cached initial HTML, schema, sitemap, no-JavaScript reading, hydrated search, app navigation, mobile layouts and exact-version cooking links.
- Build checks verify 24-hour detail ISR, query-driven directory rendering with a 30-minute data cache, runtime path generation, native route exclusion, unchanged native sitemap behavior and absence of server cache code in native assets.
- `node scripts/test-public-recipes-cache.mjs` advances both clocks used by an isolated Next production server, mocks source reads and restores affected build artifacts afterward. It verifies new-path MISS → HIT, one shared listing read for directory/sitemap after 30 minutes, detail retention before 24 hours, later detail refresh and negative-cache recovery, and outage behavior. CI runs it after the web build. No production data is changed.

Run formatting, lint, typecheck, unit/backend/rendering tests, the browser suite and both production builds before review.
