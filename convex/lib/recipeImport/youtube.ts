"use node";

import { z } from "zod";
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

export function extractHttpLinks(text: string) {
  const candidates = text.match(/https?:\/\/[^\s<>]+/gi) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of candidates) {
    let trimmed = raw.replace(/[.,;!?]+$/, "");
    // Keep balanced parentheses in real recipe slugs, remove prose punctuation.
    while (
      trimmed.endsWith(")") &&
      (trimmed.match(/\)/g)?.length ?? 0) > (trimmed.match(/\(/g)?.length ?? 0)
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    try {
      const url = new URL(trimmed);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      // YouTube sometimes wraps outgoing links. Unwrap without fetching YouTube.
      if (
        ["www.youtube.com", "youtube.com"].includes(url.hostname) &&
        url.pathname === "/redirect"
      ) {
        const target = url.searchParams.get("q") ?? url.searchParams.get("url");
        if (!target) continue;
        const resolved = new URL(target);
        if (!["https:", "http:"].includes(resolved.protocol)) continue;
        trimmed = resolved.toString();
      } else trimmed = url.toString();
      const canonical = new URL(trimmed);
      canonical.hash = "";
      if (seen.has(canonical.toString())) continue;
      seen.add(canonical.toString());
      links.push(trimmed);
      if (links.length >= 40) break;
    } catch {
      continue;
    }
  }
  return links;
}

const excludedHosts = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "patreon.com",
  "amazon.com",
  "amazon.co.uk",
  "amzn.to",
  "google.com",
  "googleusercontent.com",
];

function linkLabel(description: string, link: string) {
  for (const line of description.split(/\r?\n/)) {
    let labelStart = 0;
    for (const match of line.matchAll(/https?:\/\/[^\s<>]+/gi)) {
      if (extractHttpLinks(match[0]).includes(link)) {
        return line.slice(labelStart, match.index);
      }
      labelStart = match.index + match[0].length;
    }
  }
  return "";
}

/** Rank all description links before applying the fetch cap; sponsor links may come first. */
export function rankedRecipeLinks(description: string): string[] {
  return extractHttpLinks(description)
    .map((link, index) => {
      const url = new URL(link);
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (
        excludedHosts.some(
          (excluded) => host === excluded || host.endsWith(`.${excluded}`),
        )
      )
        return null;
      const label = linkLabel(description, link);
      const score =
        (/\b(?:full |written |printable )?recipe\b/i.test(label) ? 8 : 0) +
        (/\/recipes?\//i.test(url.pathname) ? 4 : 0) +
        (url.pathname !== "/" ? 1 : 0) -
        (/\b(?:shop|sponsor|merch|equipment|newsletter|all recipes)\b/i.test(
          label,
        )
          ? 12
          : 0);
      return { link, score, index };
    })
    .filter((item) => item !== null)
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map(({ link }) => link);
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
      if (snippet?.description?.trim()) return snippet;
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

function hasRecipeEvidence(candidate: RecipeSourceCandidate) {
  // Acquisition signals only. The shared AI pipeline still decides completeness.
  return candidate.blocks.some(
    (block) =>
      (block.kind === "structured" &&
        /\.recipe(?:Ingredient|Instructions)(?:\[|\.|$)/.test(
          block.path ?? "",
        )) ||
      (/^h[1-6]\b/i.test(block.path ?? "") &&
        /^(?:ingredients|what you(?:’|')ll need|method|instructions|directions)\b/i.test(
          block.text,
        )) ||
      /^(?:ingredients|what you(?:’|')ll need|method|instructions|directions)\s*:?\s*$/im.test(
        block.text,
      ),
  );
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
  for (const link of rankedRecipeLinks(description)) {
    if (Date.now() >= deadline) break;
    try {
      const candidate = await extractUrlCandidate(link, deadline);
      if (hasRecipeEvidence(candidate)) return candidate;
    } catch {
      // An unsafe, blocked or non-HTML link must not hide a later usable recipe.
    }
  }
  if (!description)
    throw new ImportFailure(
      "no_recipe",
      "The video has no written description.",
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
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceName: "YouTube",
    ...(snippet.channelTitle ? { sourceAuthor: snippet.channelTitle } : {}),
  };
}
