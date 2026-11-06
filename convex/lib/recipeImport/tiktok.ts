"use node";
import { z } from "zod";
import {
  tiktokPostUrl,
  isTikTokShareUrl,
} from "../../../src/lib/domain/social-import";
import { ImportFailure } from "./contracts";
import { safeFetch, discardResponse } from "./network";
import {
  runApifyPost,
  SocialAcquisitionFailure,
  type ApifyProviderOptions,
} from "./apify";
import {
  socialPostCandidate,
  type SocialAcquisitionSummary,
} from "./socialSource";

const postSchema = z.object({
  id: z.string().regex(/^\d{15,25}$/),
  webVideoUrl: z.string().max(2048),
  text: z.string().max(20_000),
  isSlideshow: z.boolean().nullish(),
  authorMeta: z
    .object({
      name: z.string().max(200).optional(),
      privateAccount: z.boolean().optional(),
    })
    .nullish(),
  videoMeta: z.object({ coverUrl: z.string().max(4000).optional() }).nullish(),
  textIsTruncated: z.boolean().optional(),
});

export async function fetchTikTokPost(
  url: string,
  options: ApifyProviderOptions,
) {
  const target = tiktokPostUrl(url);
  if (!target)
    throw new ImportFailure("invalid_url", "Use a public TikTok post link.");
  const fail = (
    outcome: ConstructorParameters<typeof SocialAcquisitionFailure>[1],
  ) => new SocialAcquisitionFailure("tiktok", outcome);
  return runApifyPost({
    ...options,
    actor: "clockworks~tiktok-video-scraper",
    input: {
      postURLs: [target.url],
      scrapeRelatedVideos: false,
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
    },
    flatten: ["authorMeta", "videoMeta"],
    fields: [
      "id",
      "webVideoUrl",
      "text",
      "isSlideshow",
      "authorMeta.name",
      "authorMeta.privateAccount",
      "videoMeta.coverUrl",
      "textIsTruncated",
      "url",
      "error",
      "errorCode",
    ],
    fail,
    validate: (raw, timedOut) => {
      if (!Array.isArray(raw) || raw.length !== 1)
        throw fail(
          timedOut && Array.isArray(raw) && raw.length === 0
            ? "timed_out"
            : "invalid_response",
        );
      const failure = z
        .object({
          error: z.string(),
          url: z.string(),
          errorCode: z.string().optional(),
        })
        .safeParse(raw[0]);
      if (failure.success) {
        if (tiktokPostUrl(failure.data.url)?.id !== target.id)
          throw fail("wrong_post");
        throw fail(
          failure.data.errorCode === "NOT_FOUND" ? "not_found" : "unavailable",
        );
      }
      // Apify picks nested fields only after flattening; otherwise it silently omits them.
      const item = z.record(z.string(), z.unknown()).safeParse(raw[0]);
      if (!item.success) throw fail("invalid_response");
      const parsed = postSchema.safeParse({
        ...item.data,
        authorMeta: {
          name: item.data["authorMeta.name"],
          privateAccount: item.data["authorMeta.privateAccount"],
        },
        videoMeta: { coverUrl: item.data["videoMeta.coverUrl"] },
      });
      if (!parsed.success) throw fail("invalid_response");
      const post = parsed.data;
      if (
        post.id !== target.id ||
        tiktokPostUrl(post.webVideoUrl)?.id !== target.id
      )
        throw fail("wrong_post");
      if (post.authorMeta?.privateAccount) throw fail("blocked");
      if (target.kind === "photo" && post.isSlideshow === false)
        throw fail("invalid_response");
      if (post.textIsTruncated) throw fail("invalid_response");
      return post;
    },
  });
}

export async function acquireTikTokSource(
  rawUrl: string,
  sharedText: string | undefined,
  options: ApifyProviderOptions & {
    onAcquired?: (summary: SocialAcquisitionSummary) => Promise<void>;
  },
) {
  const started = Date.now();
  let target = tiktokPostUrl(rawUrl);
  if (!target && isTikTokShareUrl(rawUrl)) {
    const response = await safeFetch(rawUrl, 500_000, "html", options.deadline);
    target = tiktokPostUrl(response.url);
    await discardResponse(response);
    if (!target)
      throw new ImportFailure(
        "source_unreachable",
        "This TikTok share link could not be resolved.",
      );
  }
  if (!target)
    throw new ImportFailure("invalid_url", "Use a public TikTok post link.");
  const { post } = await fetchTikTokPost(target.url, options);
  return socialPostCandidate(
    {
      platform: "tiktok",
      sourceName: "TikTok",
      url: target.url,
      caption: post.text,
      captionComplete: true,
      // Absence of the provider's media flag is unknown, never proof of a video-only recipe.
      ...(post.isSlideshow === true
        ? { mediaType: "carousel" as const }
        : post.isSlideshow === false
          ? { mediaType: "video" as const }
          : {}),
      author: post.authorMeta?.name,
      imageUrl: post.videoMeta?.coverUrl,
    },
    sharedText,
    options,
    started,
  );
}
