import { blogRevalidateSeconds, sanityConfig } from "./content";

export const publishedPostFilter =
  '_type == "post" && defined(slug.current) && !(_id in path("drafts.**"))';
export const summaryProjection =
  '_id, _updatedAt, title, "slug": slug.current, publishedAt, excerpt, mainImage';

/** Public, read-only Sanity REST access. Next owns the cache, not the Sanity CDN. */
export async function querySanity(
  query: string,
  parameters: Record<string, string> = {},
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const { projectId, dataset } = sanityConfig();
  const url = new URL(
    `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${encodeURIComponent(dataset)}`,
  );
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", "published");
  for (const [name, value] of Object.entries(parameters))
    url.searchParams.set(`$${name}`, JSON.stringify(value));
  const response = await fetcher(url, {
    cache: "force-cache",
    next: { revalidate: blogRevalidateSeconds },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Sanity blog request failed (${response.status}).`);
  return response.json();
}
