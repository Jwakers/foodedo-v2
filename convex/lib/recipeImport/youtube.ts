"use node";

import { ImportFailure } from "./contracts";
import { readBoundedBytes, safeFetch } from "./network";
import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";

type YouTubeSnippet = {
  title?: string;
  channelTitle?: string;
  description?: string;
};

type YouTubeVideosResponse = {
  items?: Array<{
    snippet?: YouTubeSnippet;
  }>;
};

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

  if (hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return isValidYouTubeVideoId(id) ? id : null;
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/watch") {
    const id = url.searchParams.get("v") ?? undefined;
    return isValidYouTubeVideoId(id) ? id : null;
  }

  const match = path.match(/^\/(?:shorts|embed|live)\/([^/]+)$/);
  if (match) {
    const id = match[1];
    return isValidYouTubeVideoId(id) ? id : null;
  }

  return null;
}

function isValidYouTubeVideoId(value: string | undefined): value is string {
  if (!value) return false;
  if (value.length < 6 || value.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export function extractHttpLinks(text: string) {
  const candidates = text.match(/https?:\/\/[^\s<>()]+/gi) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of candidates) {
    const trimmed = raw.replace(/[),.;!?]+$/, "");
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      const canonical = url.toString();
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      links.push(canonical);
      if (links.length >= 12) break;
    } catch {
      continue;
    }
  }
  return links;
}

function isClearlyNotARecipeSite(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  return (
    hostname === "youtu.be" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtube.com" ||
    hostname.endsWith(".google.com") ||
    hostname === "google.com" ||
    hostname.endsWith(".googleusercontent.com")
  );
}

function bestRecipeLink(links: string[]) {
  for (const link of links) {
    try {
      const url = new URL(link);
      if (isClearlyNotARecipeSite(url)) continue;
      return link;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchYouTubeSnippet({
  videoId,
  apiKey,
}: {
  videoId: string;
  apiKey: string;
}): Promise<YouTubeSnippet | null> {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("key", apiKey);

  const response = await safeFetch(endpoint.toString(), 300_000, "html");
  const bytes = await readBoundedBytes(response, 300_000);
  let parsed: YouTubeVideosResponse;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as YouTubeVideosResponse;
  } catch {
    throw new ImportFailure(
      "source_unreachable",
      "YouTube metadata could not be read.",
    );
  }
  const snippet = parsed.items?.[0]?.snippet;
  if (!snippet) return null;
  return snippet;
}

export async function maybeAcquireYouTubeSource(
  url: string,
): Promise<RecipeSourceCandidate | null> {
  const videoId = parseYouTubeVideoId(url);
  if (!videoId) return null;
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) {
    throw new ImportFailure(
      "unsupported_content",
      "YouTube metadata is not configured.",
    );
  }

  const snippet = await fetchYouTubeSnippet({ videoId, apiKey });
  if (!snippet) return null;

  const description = snippet.description?.trim() ?? "";
  const links = extractHttpLinks(description);
  const linkedRecipe = bestRecipeLink(links);

  if (linkedRecipe) {
    try {
      return await extractUrlCandidate(linkedRecipe);
    } catch {
      // Fall back to description-based import. The user can still paste the
      // recipe page text if the linked site blocks automated access.
    }
  }

  const envelope = [
    snippet.title ? `Video title: ${snippet.title}` : null,
    snippet.channelTitle ? `Channel: ${snippet.channelTitle}` : null,
    description ? description : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!envelope.trim()) return null;

  const candidate = extractTextCandidate(envelope);
  return {
    ...candidate,
    sourceUrl: url,
    sourceName: "YouTube",
    ...(snippet.channelTitle ? { sourceAuthor: snippet.channelTitle } : {}),
  };
}
