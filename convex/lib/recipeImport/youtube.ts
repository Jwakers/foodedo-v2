"use node";

import { z } from "zod";
import {
  extractHttpLinks,
  rankedRecipeLinks,
  hasRecipeEvidence,
  hasUnresolvedRecipeReference,
} from "./linkedSources";
export { extractHttpLinks, rankedRecipeLinks } from "./linkedSources";
import { ImportFailure, RECIPE_IMPORT_LIMITS } from "./contracts";
import {
  assertPublicUrlShape,
  discardResponse,
  readBoundedBytes,
  safeFetch,
} from "./network";
import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";

const snippetSchema = z.object({
  title: z.string().max(1_000).optional(),
  channelTitle: z.string().max(1_000).optional(),
  description: z.string().max(20_000).optional(),
});
type YouTubeSnippet = z.infer<typeof snippetSchema>;
const apiResponseSchema = z.object({
  items: z
    .array(z.object({ snippet: snippetSchema.optional() }))
    .max(1)
    .optional(),
});
const playerSchema = z.object({
  videoDetails: z.object({
    videoId: z.string(),
    title: z.string().max(1_000),
    author: z.string().max(1_000),
    shortDescription: z.string().max(20_000),
  }),
});
const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

export function parseYouTubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!YOUTUBE_HOSTNAMES.has(hostname)) return null;
  assertPublicUrlShape(url);
  if (url.port && url.port !== "443" && url.port !== "80") return null;
  const path = url.pathname.replace(/\/+$/, "");
  const id =
    hostname === "youtu.be"
      ? path.match(/^\/([^/]+)$/)?.[1]
      : path === "/watch"
        ? url.searchParams.get("v")
        : path.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1];
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
}

/** Read data, never execute watch-page JavaScript or use truncated meta descriptions. */
export function extractYouTubeWatchSnippet(
  html: string,
  videoId: string,
): YouTubeSnippet | null {
  const marker = /(?:var\s+)?ytInitialPlayerResponse\s*=\s*\{/.exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].lastIndexOf("{");
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        const parsed = playerSchema.safeParse(
          JSON.parse(html.slice(start, index + 1)),
        );
        if (!parsed.success || parsed.data.videoDetails.videoId !== videoId)
          return null;
        const details = parsed.data.videoDetails;
        return {
          title: details.title,
          channelTitle: details.author,
          description: details.shortDescription,
        };
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchYouTubeSnippet(
  videoId: string,
  deadline: number,
): Promise<YouTubeSnippet> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (apiKey) {
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
      endpoint.searchParams.set("part", "snippet");
      endpoint.searchParams.set("id", videoId);
      endpoint.searchParams.set("key", apiKey);
      const response = await safeFetch(
        endpoint.toString(),
        300_000,
        "json",
        deadline,
      );
      const bytes = await readBoundedBytes(response, 300_000);
      const parsed = apiResponseSchema.safeParse(
        JSON.parse(new TextDecoder().decode(bytes)),
      );
      const snippet = parsed.success
        ? parsed.data.items?.[0]?.snippet
        : undefined;
      if (snippet && typeof snippet.description === "string") return snippet;
    } catch {
      // Missing/quota-limited metadata uses the same bounded public-page fallback.
    }
  }
  const response = await safeFetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    RECIPE_IMPORT_LIMITS.htmlBytes,
    "html",
    deadline,
  );
  if (
    !/text\/html|application\/xhtml\+xml/i.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    await discardResponse(response);
    throw new ImportFailure(
      "unsupported_content",
      "YouTube did not return a watch page.",
    );
  }
  const bytes = await readBoundedBytes(
    response,
    RECIPE_IMPORT_LIMITS.htmlBytes,
  );
  const snippet = extractYouTubeWatchSnippet(
    new TextDecoder().decode(bytes),
    videoId,
  );
  if (!snippet)
    throw new ImportFailure(
      "unsupported_content",
      "YouTube description was unavailable.",
    );
  return snippet;
}

export async function maybeAcquireYouTubeSource(
  url: string,
): Promise<RecipeSourceCandidate | null> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) return null;
  // Includes metadata, all linked pages, redirects and body reads; leave time for AI.
  const deadline = Date.now() + 25_000;
  const snippet = await fetchYouTubeSnippet(videoId, deadline);
  const description = snippet.description?.trim() ?? "";
  const links = rankedRecipeLinks(description, 4);
  let linkedContentUnavailable =
    links.length > 3 ||
    extractHttpLinks(description).length >= 40 ||
    hasUnresolvedRecipeReference(description);
  for (const link of links.slice(0, 3)) {
    if (Date.now() >= deadline) {
      linkedContentUnavailable = true;
      break;
    }
    try {
      const candidate = await extractUrlCandidate(link, deadline);
      if (hasRecipeEvidence(candidate)) return candidate;
    } catch {
      linkedContentUnavailable = true;
      // An unsafe, blocked or non-HTML link must not hide a later usable recipe.
    }
  }
  if (!description && !snippet.title)
    throw new ImportFailure(
      "no_recipe",
      "The video has no written recipe context.",
    );
  const envelope = [
    snippet.title ? `Video title: ${snippet.title}` : null,
    snippet.channelTitle ? `Channel: ${snippet.channelTitle}` : null,
    description,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    ...extractTextCandidate(envelope),
    socialEvidence: {
      platform: "youtube",
      mediaType: "video",
      captionComplete: true,
      linkedContentUnavailable,
    },
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceName: "YouTube",
    ...(snippet.channelTitle ? { sourceAuthor: snippet.channelTitle } : {}),
  };
}
