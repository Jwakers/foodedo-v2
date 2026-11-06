"use node";
import { z } from "zod";
import { instagramPostUrl } from "../../../src/lib/domain/social-import";
import { ImportFailure } from "./contracts";
import {
  runApifyPost,
  SocialAcquisitionFailure,
  type SocialProviderOutcome,
  type ApifyProviderOptions,
} from "./apify";
export class InstagramAcquisitionFailure extends SocialAcquisitionFailure {
  constructor(outcome: SocialProviderOutcome) {
    super("instagram", outcome);
  }
}
const postSchema = z.object({
  url: z.string().max(2048),
  shortCode: z.string().max(64),
  caption: z.string().max(20_000),
  type: z.enum(["Video", "Image", "Sidecar"]),
  ownerUsername: z.string().max(200).optional(),
  ownerFullName: z.string().max(300).optional(),
  displayUrl: z.string().max(4000).optional(),
  captionIsTruncated: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});
export type InstagramPost = z.infer<typeof postSchema>;
export type InstagramProviderResult = {
  post: InstagramPost;
  runId: string;
  buildId?: string;
  costUsd?: number;
};
export type InstagramProviderOptions = ApifyProviderOptions;
function validatePost(
  raw: unknown,
  target: NonNullable<ReturnType<typeof instagramPostUrl>>,
  timedOut: boolean,
) {
  if (!Array.isArray(raw) || raw.length !== 1)
    throw new InstagramAcquisitionFailure(
      timedOut && Array.isArray(raw) && raw.length === 0
        ? "timed_out"
        : "invalid_response",
    );
  const missing = z
    .object({ url: z.string(), error: z.literal("not_found") })
    .safeParse(raw[0]);
  if (missing.success) {
    if (instagramPostUrl(missing.data.url)?.shortcode !== target.shortcode)
      throw new InstagramAcquisitionFailure("wrong_post");
    throw new InstagramAcquisitionFailure("not_found");
  }
  const parsed = postSchema.safeParse(raw[0]);
  if (!parsed.success)
    throw new InstagramAcquisitionFailure("invalid_response");
  const post = parsed.data;
  if (
    post.shortCode !== target.shortcode ||
    instagramPostUrl(post.url)?.shortcode !== target.shortcode
  )
    throw new InstagramAcquisitionFailure("wrong_post");
  if (post.isPrivate) throw new InstagramAcquisitionFailure("blocked");
  if (post.captionIsTruncated)
    throw new InstagramAcquisitionFailure("invalid_response");
  return post;
}

export async function fetchInstagramPost(
  url: string,
  options: InstagramProviderOptions,
): Promise<InstagramProviderResult> {
  const target = instagramPostUrl(url);
  if (!target)
    throw new ImportFailure(
      "invalid_url",
      "Use a public Instagram post or Reel link.",
    );
  return runApifyPost({
    ...options,
    actor: "apify~instagram-scraper",
    input: {
      directUrls: [target.url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    },
    fields: [...Object.keys(postSchema.shape), "error", "errorDescription"],
    validate: (raw, timedOut) => validatePost(raw, target, timedOut),
    fail: (outcome) => new InstagramAcquisitionFailure(outcome),
  });
}
