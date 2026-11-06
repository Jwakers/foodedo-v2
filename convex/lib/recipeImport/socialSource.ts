"use node";
import { ImportFailure } from "./contracts";
import type { ApifyProviderOptions } from "./apify";
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

export type SocialAcquisitionSummary = {
  platform: "instagram" | "tiktok";
  provider: "apify";
  outcome: "acquired";
  mediaType?: "video" | "image" | "carousel";
  captionCharacters: number;
  suppliedTextPresent: boolean;
  linkedPagesTried: number;
  linkedContentUnavailable: boolean;
  durationMs: number;
};
export type SocialPost = {
  platform: "instagram" | "tiktok";
  sourceName: string;
  url: string;
  caption: string;
  captionComplete: boolean;
  mediaType?: "video" | "image" | "carousel";
  author?: string;
  imageUrl?: string;
};
export async function socialPostCandidate(
  post: SocialPost,
  sharedText: string | undefined,
  options: ApifyProviderOptions & {
    onAcquired?: (summary: SocialAcquisitionSummary) => Promise<void>;
  },
  started: number,
): Promise<RecipeSourceCandidate> {
  const mediaType = post.mediaType;
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
    platform: post.platform,
    provider: "apify",
    outcome: "acquired",
    ...(mediaType ? { mediaType } : {}),
    captionCharacters: post.caption.length,
    suppliedTextPresent: Boolean(sharedText?.trim()),
    linkedPagesTried,
    linkedContentUnavailable,
    durationMs: Date.now() - started,
  });
  if (chosen) return chosen;
  if (
    mediaType === "video" &&
    post.captionComplete &&
    !text.trim() &&
    !linkedContentUnavailable
  )
    throw new ImportFailure(
      "video_only_unsupported",
      "This video has no written recipe caption.",
    );
  const source = extractTextCandidate(
    [
      `${post.sourceName} ${mediaType ?? "post"} caption:`,
      post.caption,
      sharedText ? `User-supplied shared context:\n${sharedText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  return {
    ...source,
    sourceUrl: post.url,
    sourceName: post.sourceName,
    ...(post.author ? { sourceAuthor: post.author } : {}),
    ...(post.imageUrl ? { sourceImageUrls: [post.imageUrl] } : {}),
    ...(mediaType
      ? {
          socialEvidence: {
            platform: post.platform,
            mediaType,
            captionComplete: post.captionComplete,
            linkedContentUnavailable,
          },
        }
      : {}),
  };
}
