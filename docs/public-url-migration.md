# Public URL continuity

V2 restores the ten top-level V1 intent pages and the FAQ, support hub, how-to, privacy and terms routes. Content is local in `src/features/public-pages/pages.json`; explicit `.web.tsx` entrypoints use the shared editorial shell and are excluded from Capacitor. Each page has a self-referencing canonical, title, description and initial server-rendered content. No CMS or V1 backend writes are involved.

`docs/public-url-inventory.json` combines every static V1 `(site)` page with the existing 33-article blog inventory and 97-recipe inventory. It records expected initial/final statuses and destinations. Authenticated dashboard, private recipe, invite and auth flows are outside this public SEO inventory. Search Console exports can identify historical URLs absent from the current V1 source; this is not proof of every URL ever indexed.

Pricing temporarily redirects with 307 to FAQ, which states that Foodedo is currently free. Remove that redirect when pricing returns. Beta permanently redirects to home. Existing Discover redirects remain unchanged. The documented removed Cottage Pie URL still redirects to a real 404. `/support/contact` is restored as a public Formspree contact page; see [Contact](./contact.md) for configuration and verification.

## Legal review before publication

Privacy and Terms are **drafts**, visibly labelled on the pages. They are not approved operative policies. Before deploying these pages publicly, the owner must review their copy and resolve:

- Service operator/controller legal identity and public contact/request channel.
- Actual retention schedules, backups, recovery windows and the handling of shared household records after account deletion; distinguish backend deletion handling from availability of a user-facing deletion flow.
- Full processor/subprocessor list and current provider terms, including Clerk, Convex, hosting, AI Gateway/model providers and any analytics actually enabled in production; international transfers and regional processing.
- Cookie/device-storage disclosures, privacy rights and request handling appropriate to the service's users and jurisdictions.
- Terms covering eligibility, permitted use/content rights, suspension, service changes, notices, liability and governing law.

The page drafts describe verified architecture without inventing contact details, fixed retention promises or approved legal clauses. Content and titles have no fabricated effective date. Review and approval are a release gate, not something a successful build can establish.

## Verification and release

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build:ios:web`, `node scripts/check-public-pages-build.mjs native`, `pnpm build` and `node scripts/check-public-pages-build.mjs web`. Existing blog/recipe build checks remain in force. Browser coverage is in `tests/e2e/public-pages.spec.ts`, alongside the existing blog and public-recipe suites.

Start the production web server on port 3100, then run:

```sh
node scripts/audit-public-urls.mjs http://127.0.0.1:3100
node scripts/audit-blog.mjs http://127.0.0.1:3100
```

The public audit checks every inventory entry, including the documented removed-recipe exception. It checks initial and final status, direct redirect destinations, query preservation, initial HTML, canonical, indexability, sitemap membership and unknown-path 404 behavior. The existing blog audit additionally reads the current published CMS list so articles added since the snapshot are covered. Both accept a preview or production origin; pass the canonical origin with `SITE_URL` if it differs from production's default. A preview-wide platform `noindex` header will intentionally fail the public audit's indexability check; rerun on the final production deployment.

Before switching traffic, merge any Search Console URL exports into the inventory, audit the deployed preview and record baseline clicks/impressions/indexed pages. After release, audit production, submit `/sitemap.xml` in Search Console and inspect the example landing page plus representative help, article and redirected recipe URLs. Check indexing/crawl errors and compare organic performance over four weeks. No deployment or Search Console mutation is performed by these scripts.

## Local verification — 27 October 2026

Both production builds passed. The native public-page, blog and recipe isolation checks passed; the web public-page and blog prerender checks passed. Formatting, lint, typecheck and all 263 unit tests passed. All 16 restored-page, blog and public-recipe browser checks passed, including all 15 restored pages without JavaScript, 320px layout, keyboard skip navigation, guest entry and guest-plan preservation. The live published-blog audit passed for 27 CMS articles and six guides. The example page was also visually inspected at 390px.

The first full URL audit exposed a missing recipe: `/discover/recipe/chicken-tacos-with-salsa` led to a 404 in V2. The owner approved `/recipes/chicken-tacos-with-avocado-salsa` as its replacement on 27 October 2026. Both the legacy Discover URL and the missing V2 recipe URL now redirect directly to that destination with 308, and rendered article links use the final URL. The inventories record this decision explicitly; the complete 152-URL audit now passes, including the restored contact page and removed Cottage Pie exception. The existing recipe prerender/migration checks also pass. The documented removed Cottage Pie exception remains unchanged.

The recipe-cooking browser check now verifies both supported serving controls and authored servings when source-only quantities disable scaling, while still checking exact recipe identity/revision in the Cook URL. The blog browser tests had stale copy and one-step planning expectations; they now exercise the existing V2 copy and planning setup flow. The recipe discovery check now respects the existing 20-recipe first page and checks complete discovery through the sitemap. No recipe or planning behavior was changed to satisfy those tests.

No deployed-preview URL was supplied, and no production deployment or Search Console changes were performed. Re-run these checks against the release deployment after legal review.
