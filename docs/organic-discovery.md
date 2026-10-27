# Recipe-to-shopping-list content and discovery

Implemented on 27 October 2026 in three reviewable groups. Release dates remain unset until production verification. Analytics, automatic publishing, broader article rewrites and the September traffic decline are outside this change.

## 1. Worked example and contextual links

`/recipe-to-shopping-list` retains its URL, title and self-canonical. The reviewed example uses revision 2 of Chicken Shawarma Pitta Wraps, Tofu Stir-Fry with Broccoli, Pepper and Rice, and Teriyaki Salmon with Jasmine Rice and Steamed Broccoli. Each is authored for two servings. The checked snapshot is `src/features/public-pages/shopping-list-example.json`; its renderer uses Shopping's existing serving model, grouping, quantity display and cupboard treatment. Water is omitted; incompatible amounts and source details stay visible. Categories describe app shopping sections, not a store-specific aisle map. Try Foodedo enters ordinary guest planning without preselecting these meals.

Three supporting public guides, three local blog guides and the reviewed override for `how-to-build-shopping-list-from-meal-plan` contain contextual links to the example. They keep their distinct answers and self-canonicals. Sanity and the catalogue are unchanged.

Before publication and during content maintenance, run:

```sh
node scripts/audit-shopping-list-example.mjs
```

This public, read-only audit checks each snapshot's source identity, version and content against the production catalogue. CI runs it too. A mismatch requires editorial review: update the snapshot and actual verification date deliberately, check every ingredient and merging example, and rerun tests. Never change recipe quantities just to simplify this article.

## 2. Homepage rendering

Shared welcome presentation renders while authentication loads. Guest query-string intent has a separate empty Suspense boundary so it cannot withhold homepage content. A web-specific entrypoint supplies homepage metadata and canonical; native retains its static entrypoint. Web welcome links to Recipes, the worked example and Blog. Existing guest session persistence, plan claims and signed-in dashboard selection remain in use.

## 3. One recipe-browsing interface

Web browsing uses numbered pagination with 20 recipes per page. `/recipes` and `/recipes?page=2` (and beyond) render the same `RecipesListing`, including search, filters, collection tabs, recipe cards and save actions. There is one pagination control, with Previous, page numbers and Next; no web Load more control or separate directory presentation remains. The native app retains its existing cursor-based Load more interface.

The single web page reads Next.js 16’s async `searchParams` and renders public page/search/filter/sort selections at request time from the shared 30-minute catalogue cache. Only the selected 20 summaries reach the browser. Default ordering remains descending published position. Public HTML and pagination links remain usable without JavaScript. Each page has its own canonical. The first-page canonical is `/recipes`; subsequent pages self-canonicalise with `?page=n`. Invalid or out-of-range public page parameters return 404. Old `/recipes/page/:pageNumber` paths permanently redirect to query URLs, retaining other parameters. New pages work after the data cache refreshes without rebuilding. Directory HTML is no longer prebuilt or full-route cached, but the underlying catalogue reads retain their shared 30-minute cache. Recipe URLs remain in the sitemap.

Search, filters, sort and All/Saved/Yours are persisted in web query parameters. Changes reset to page one. Typing/refining updates browser history without a server request per keystroke and uses existing backend queries. Public pagination follows Next.js links to the server-rendered query selection; personal collections remain client-authenticated. Refined/private URLs are noindex. The cursor hook fetches enough bounded batches for the selected page, including short sparse-search batches, while the interface shows only that page. Refresh and Back restore the selection; if deletions leave a private/refined page beyond the results, it returns to the last available page. Public cache entries never include personal query results. Filter objects remain stable between URL changes so unrelated live updates cannot reset edits in an open filter drawer.

No new backend API or schema is required. The public pagination routes and server fetching remain excluded from iOS.

## Validation and release

Local verification passed:

- 276 unit tests; 231 backend/rendering tests; 151 browser tests after the query-parameter correction, including server-rendered filtered HTML, self-canonicals, legacy path redirects, refresh/Back and filter/sort draft preservation.
- Formatting, lint and typecheck; both production builds and all web/native manifest checks.
- Read-only source audit against all three published recipe revisions.
- Cache checks for new recipe MISS → HIT and query-driven directory slices without rebuilding, a shared directory/sitemap listing read, 24-hour recipe refresh, negative-cache recovery and outage handling.
- Public-URL/browser audits following continuation links to every sitemap recipe, checking initial HTML and canonicals, mobile layout, and existing guest, signed-in and saving journeys; web pagination/search refresh and Back; and native-style Load more appending 20 recipes to 40.

Cache verification temporarily restores compiled artifacts. Run it before browser tests, never concurrently with a server using the same `.next` directory.

| Stage                    | Production release date | Verification                                        |
| ------------------------ | ----------------------- | --------------------------------------------------- |
| Worked example and links | Pending                 | List, seven supporting links and three recipe links |
| Homepage HTML            | Pending                 | Raw HTML, canonical, guest/account entry            |
| Recipe continuation      | Pending                 | All page links, final partial page and redirects    |

Deploy the groups separately through the normal review/release process. After release, run `node scripts/audit-public-urls.mjs https://www.foodedo.com` and inspect affected production pages. Record actual dates above. Review Search Console after four and eight weeks, splitting US/UK and device groups where possible. Ranking gains and the cause of the September decline are not assumed.

## Domain correction — completed 27 October 2026

Vercel inspection found that the apex already redirected to `www.foodedo.com`, but its DNS was misconfigured. DNS returned valid Vercel A address `216.198.79.1` alongside parking addresses `13.248.213.45` and `76.223.67.189`. HTTP served a parking page; HTTPS failed TLS. The signed-in 123 Reg table showed the valid A record and one `A / @ / Parked` record, supplying both parking addresses.

After the owner's explicit approval, removed only `A / @ / Parked` through 123 Reg. The record count changed from 15 to 14 and the valid Vercel record remained. No other records were edited. Both authoritative nameservers, `ns05.domaincontrol.com` and `ns06.domaincontrol.com`, now return only `216.198.79.1`; Vercel reports `configuredBy: A`, `misconfigured: false` and accepts HTTP-01 validation.

The apex also lacked a certificate. With separate explicit approval, issued a Vercel-managed certificate using `vercel certs issue foodedo.com --scope jwakers-projects`. Certificate validation succeeds without bypasses. Existing `www` certificate and project redirect settings remain unchanged.

At 15:15 UTC, all four variants were verified against `/recipe-to-shopping-list?source=redirect-check`:

| Entry      | Verified chain                                              |
| ---------- | ----------------------------------------------------------- |
| HTTP apex  | 308 to HTTPS apex, then existing 307 to HTTPS www, then 200 |
| HTTP www   | 308 to HTTPS www, then 200                                  |
| HTTPS apex | Existing 307 to HTTPS www, then 200                         |
| HTTPS www  | 200                                                         |

Every chain retains the nested path and query. Recursive resolvers may retain old records for their previous 600-second TTL. The application changes above remain undeployed; this DNS/TLS correction is the only production change performed here.
