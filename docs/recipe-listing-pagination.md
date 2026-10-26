# Recipe listing pagination

The All and Saved scopes use `catalogue.list` with indexed Convex streams and the gap-preserving `usePaginatedQuery` hook from `convex-helpers/react`. The first request and each Load more request ask for 20 recipes. Filters, search and sort changes reset to the first page. The web directory embeds only the first page; the sitemap keeps the complete published directory. The Capacitor listing uses the same client query.

Catalogue filters and sorting run before pagination. Default (Recommended) order uses the existing published-position index in descending order, showing newly added catalogue recipes first. Editorial replacements retain their original position. Quickest and lowest-cost use materialised duration and cost-rank keys, with position as the tie-breaker. Unknown durations/costs sort last. Publication writes these keys automatically.

The existing case-insensitive substring search is retained. Predicates run while streaming the selected index, before page selection, so each request stops once it has enough matches. Requests are bounded to 256 scanned recipes and 4 MiB; sparse searches can return a short or empty batch with a continuation cursor. The interface keeps Load more available and does not claim there are no matches until the stream is exhausted. Saved membership is checked with an indexed lookup per matching candidate, rather than re-reading the entire saved library per page. The separate heart-state query excludes imported/manual recipes by index.

Yours also requests 20 at a time and excludes catalogue snapshots before pagination. Its search, filters and sort run across the entire personal library on the backend. Personal sort keys are the negative duration/cost rank in descending indexes, preserving newest-saved-first order within ties. Recipe creation, import finalisation, editing and catalogue saving maintain those keys. Filter drawers on the listing use “Show recipes” rather than claiming a total from a partial page.

## Existing deployment upgrade

After updating the V2 backend with `pnpm exec convex dev --once`, run:

```sh
pnpm exec convex run catalogue:backfillBrowseKeys '{"paginationOpts":{"numItems":100,"cursor":null}}'
pnpm exec convex run recipes:backfillBrowseKeys '{"paginationOpts":{"numItems":100,"cursor":null}}'
```

These internal, idempotent mutations fill sort keys on existing catalogue revisions and personal recipes, scheduling further 100-record batches if needed. Run them on each V2 deployment receiving this change before relying on duration filtering or the new sort indexes. It does not edit recipe content, publication status, ownership or library membership.
