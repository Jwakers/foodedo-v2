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
  socialPostCandidate,
  type SocialAcquisitionSummary,
} from "./socialSource";
import type { RecipeSourceCandidate } from "./source";
export async function acquireInstagramSource(
  rawUrl: string,
  sharedText: string | undefined,
  options: InstagramProviderOptions & {
    onAcquired?: (summary: SocialAcquisitionSummary) => Promise<void>;
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
  return socialPostCandidate(
    {
      platform: "instagram",
      sourceName: "Instagram",
      url: target.url,
      caption: post.caption,
      captionComplete: true,
      mediaType,
      author: post.ownerUsername,
      imageUrl: post.displayUrl,
    },
    sharedText,
    options,
    started,
  );
}
