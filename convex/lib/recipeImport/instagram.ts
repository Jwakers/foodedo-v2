"use node";
import {
  instagramPostUrl,
  socialImportPlatform,
} from "../../../src/lib/domain/social-import";
import { ImportFailure } from "./contracts";
import { safeFetch, discardResponse } from "./network";
import {
  fetchInstagramPost,
  type InstagramProviderOptions,
} from "./instagramProvider";
import {
  extractHttpLinks,
  rankedRecipeLinks,
  hasRecipeEvidence,
  hasUnresolvedRecipeReference,
} from "./linkedSources";
import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";

export type InstagramAcquisitionSummary = {
  platform: "instagram";
  provider: "apify";
  outcome: "acquired";
  mediaType: "video" | "image" | "carousel";
  captionCharacters: number;
  suppliedTextPresent: boolean;
  linkedPagesTried: number;
  linkedContentUnavailable: boolean;
  durationMs: number;
};
export async function acquireInstagramSource(
  rawUrl: string,
  sharedText: string | undefined,
  options: InstagramProviderOptions & {
    onAcquired?: (summary: InstagramAcquisitionSummary) => Promise<void>;
  },
): Promise<RecipeSourceCandidate> {
  const started = Date.now();
  let target = instagramPostUrl(rawUrl);
  if (
    !target &&
    socialImportPlatform(rawUrl) === "instagram" &&
    new URL(rawUrl).pathname.startsWith("/share/")
  ) {
    const response = await safeFetch(rawUrl, 500_000, "html", options.deadline);
    target = instagramPostUrl(response.url);
    await discardResponse(response);
  }
  if (!target)
    throw new ImportFailure(
      "invalid_url",
      "Use a public Instagram post or Reel link.",
    );
  const { post } = await fetchInstagramPost(target.url, options);
  const mediaType =
    post.type === "Video"
      ? "video"
      : post.type === "Sidecar"
        ? "carousel"
        : "image";
  // A shared caption may add evidence; it must never conceal provider acquisition failures.
  const text = [post.caption, sharedText?.trim()].filter(Boolean).join("\n\n");
  const links = rankedRecipeLinks(text, 4);
  let linkedContentUnavailable =
    links.length > 3 ||
    extractHttpLinks(text).length >= 40 ||
    hasUnresolvedRecipeReference(text);
  let linkedPagesTried = 0;
  let chosen: RecipeSourceCandidate | undefined;
  for (const link of links.slice(0, 3)) {
    if (Date.now() >= options.deadline) {
      linkedContentUnavailable = true;
      break;
    }
    linkedPagesTried++;
    try {
      const candidate = await extractUrlCandidate(link, options.deadline);
      if (hasRecipeEvidence(candidate)) {
        chosen = candidate;
        break;
      }
    } catch {
      linkedContentUnavailable = true;
    }
  }
  await options.onAcquired?.({
    platform: "instagram",
    provider: "apify",
    outcome: "acquired",
    mediaType,
    captionCharacters: post.caption.length,
    suppliedTextPresent: Boolean(sharedText?.trim()),
    linkedPagesTried,
    linkedContentUnavailable,
    durationMs: Date.now() - started,
  });
  if (chosen) return chosen;
  if (mediaType === "video" && !text.trim() && !linkedContentUnavailable)
    throw new ImportFailure(
      "video_only_unsupported",
      "This video has no written recipe caption.",
    );
  const source = extractTextCandidate(
    [
      `Instagram ${mediaType} caption:`,
      post.caption,
      sharedText ? `User-supplied shared context:\n${sharedText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  return {
    ...source,
    sourceUrl: target.url,
    sourceName: "Instagram",
    ...(post.ownerUsername ? { sourceAuthor: post.ownerUsername } : {}),
    ...(post.displayUrl ? { sourceImageUrls: [post.displayUrl] } : {}),
    socialEvidence: {
      platform: "instagram",
      mediaType,
      captionComplete: true,
      linkedContentUnavailable,
    },
  };
}
