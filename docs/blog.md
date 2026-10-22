# Web blog

The approved blog lives at `/blog` and `/blog/[slug]`, alongside the product on the same web origin. It is a secondary discovery surface: welcome-screen link, editorial header/footer, public articles, and a no-obligation **Try Foodedo** action. It is absent from the packaged iOS app.

## Content and rendering

The existing **Sanity** project `i8ook8b1`, dataset `production`, remains the CMS. Optional server-side `SANITY_PROJECT_ID` and `SANITY_DATASET` settings override these defaults. Reads use the published perspective, explicitly exclude draft documents, and require no token. V1, its backend and `foodedo-cms` are unchanged. No CMS editor, write credentials or blog records were added to Convex.

`src/features/blog/sanity.server.ts` shares validated content across index, articles, metadata and sitemap. The index and article routes explicitly use `dynamic = "force-static"`; all published slugs and local guides are generated at build time. `dynamicParams = true` permits new articles to be generated and cached on their first visit, without rebuilding. Sanity reads explicitly use `cache: "force-cache"` with a 60-second lifetime; route output uses the same ISR interval. React `cache()` shares the validated article between metadata and page rendering, including when a request timeout signal disables Next's automatic fetch memoization.

Revalidation is demand-driven: the first request after expiry can receive the cached page while the next version is generated. Cache hits serve the existing HTML rather than rerendering it for each visitor. No cron or CMS webhook is required. Framework-managed cache headers are left to Next.js/Vercel. A failed CMS request raises an error rather than returning a false empty list or 404; failed background revalidation retains the last successful page. A successful response with no article returns a real 404. Requests time out after 15 seconds.

The six original code-based guides remain local in `src/features/blog/guides.json`, with their titles and URLs preserved. All six guides were reviewed against V2’s implemented journeys on 22 October 2026. They describe suggested-plan review and swaps, account creation when saving, automatically linked shopping lists, manual cupboard checks and the distinction between Household and Private. They do not promise guest shopping-list editing, automatic pantry tracking or universal ingredient merging. Local guides retain precedence over a CMS document with the same slug, matching V1's static-route precedence. Guides have no fabricated author, image or publication date.

Portable Text renders headings, nested ordered/unordered lists, marks, links and the CMS's actual `pteImage.image` object with caption/alt text. A leading body H1 that exactly repeats the article title is omitted; other body H1s become H2s so the page has one primary heading. Optional missing/corrupt images do not hide the article. Existing CMS copy is otherwise preserved. Old product links are resolved to current V2 destinations at render time; retired sign-up/pricing links enter the guest product. No redirects are necessary for the 33 inventoried blog URLs because none changed.

Article-local fragment/query links retain their current-page destination. Mapped guest links preserve their query parameters and fragment through rendering. Image dimensions use Sanity's crop and pixel-rounding rules to reserve the correct aspect ratio before the image loads.

## Layouts, guest entry and builds

The root layout owns global styles, fonts and metadata. The `(product)` route group owns Clerk/Convex providers, household state, app navigation and continuation effects. The `(editorial)` group owns the blog reading layout and has no account dependency.

Try links carry `/?try=1` and synchronously invoke the existing welcome-skip action for ordinary clicks. Home consumes that explicit intent, persists the existing session skip and removes only the `try` parameter. This also works in a fresh tab. It does not create or replace a plan, change personal data, sign out an account or prompt for authentication. Existing authenticated home/plan hydration remains responsible for current account state. Guests can reopen an existing temporary plan from Week.

`next.config.ts` discovers `.web.tsx`/`.web.ts` entrypoints for web and `.native.tsx`/`.native.ts` for iOS, alongside normal extensions. Blog entrypoints use the web suffix. Explicit `sitemap.xml/route.*.ts` handlers preserve the catalogue sitemap in both builds and add live blog entries only on web; `robots.txt/route.web.ts` advertises the web sitemap. Explicit handlers are intentional: this installed Next.js version discovers suffixed metadata files such as `sitemap.web.ts` but does not produce a working GET handler for them.

The web sitemap includes `/`, `/blog`, `/recipes`, public catalogue pages at `/recipes/[slug]` and every guide/article. It shares the public directory’s 30-minute catalogue listing cache while retaining its 60-second route lifetime for blog discovery. Native sitemap behavior remains unchanged. See [Public recipes](./public-recipes.md). Canonicals, sitemap URLs and structured data use `SITE_URL`, then `NEXT_PUBLIC_SITE_URL`, then `https://www.foodedo.com`. Optional article metadata and `BlogPosting` data reflect real CMS dates and images. Structured JSON is escaped for safe HTML embedding.

## Verification and launch

- `docs/blog-url-inventory.json` records the 27 published CMS articles and six local guides read on 21 October 2026.
- Unit tests cover source filtering/cache settings, error distinctions, URL mapping, truthful/safe metadata, optional images and XML escaping. The rendering test covers rich content and nested CMS images.
- Blog browser tests check all preserved URLs, initial HTML, a real 404, sitemap/robots, reading without JavaScript, absence of auth dependencies, mobile overflow, fresh-tab guest entry and preservation of an existing guest plan.
- Browser cache checks confirm `x-nextjs-cache: HIT` and the 60-second shared-cache interval for the index, a CMS article and sitemap. Unit/rendering regressions cover same-page anchors, guest-link parameters and cropped image dimensions.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:convex`, `pnpm build:ios:web` and `pnpm build`. Run browser checks against the final web build with `pnpm exec playwright test tests/e2e/blog.spec.ts`.
- Run `node scripts/audit-blog.mjs http://127.0.0.1:3100` against a local production server, or replace the origin with the deployed preview/production origin. It reads the current published CMS list and checks both that list and the migration inventory, so new articles are included without changing the snapshot.
- Inspect the native export's route manifest and assets: no `/blog` routes, welcome Blog link, Sanity API code or editorial content should ship. The catalogue sitemap must still export successfully.
- CI runs `node scripts/check-blog-build.mjs native` after the native build and `node scripts/check-blog-build.mjs web` after the web build. These inspect the compiled manifests: all 33 inventoried articles and the index must be static with 60-second ISR; unbuilt article paths must remain enabled; the iOS export must exclude editorial routes/content and Sanity code.

The quality pass also exercised the production server with a local mocked CMS article absent from the build: the first request was `MISS`, the next was `HIT`, and after the real 60-second interval the route returned `STALE` before serving the updated article as `HIT`. Metadata and body shared one CMS request per generation (two reads total). The test changed no CMS content; its temporary generated page/cache entries were removed and the production web build regenerated afterward. Vercel's deployed edge cache still requires verification after deployment; these checks exercise Next.js production caching locally.

Deployment and Search Console changes are not performed by the build. Before replacing V1, run the audit against the preview and record the current Search Console impressions, clicks and indexed pages for `/blog/`. After deployment, submit `/sitemap.xml`, inspect representative articles and check for crawl errors. Review organic performance after four weeks. Product conversion analytics and a new editorial programme remain deferred.
