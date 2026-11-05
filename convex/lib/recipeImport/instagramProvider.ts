"use node";
import { fetch } from "undici";
import { z } from "zod";
import { instagramPostUrl } from "../../../src/lib/domain/social-import";
import { ImportFailure } from "./contracts";
import { readBoundedBytes } from "./network";

export type InstagramProviderOutcome =
  | "not_found"
  | "configuration"
  | "blocked"
  | "rate_limited"
  | "unavailable"
  | "wrong_post"
  | "invalid_response"
  | "timed_out";
export class InstagramAcquisitionFailure extends ImportFailure {
  constructor(readonly acquisitionOutcome: InstagramProviderOutcome) {
    super(
      acquisitionOutcome === "configuration"
        ? "instagram_unavailable"
        : acquisitionOutcome === "timed_out"
          ? "timed_out"
          : acquisitionOutcome === "blocked" ||
              acquisitionOutcome === "rate_limited"
            ? "source_blocked"
            : "source_unreachable",
      "Instagram caption acquisition was unavailable.",
    );
  }
}
const runSchema = z.object({
  data: z.object({
    id: z.string().regex(/^[a-zA-Z0-9]+$/),
    status: z.string(),
    defaultDatasetId: z
      .string()
      .regex(/^[a-zA-Z0-9]+$/)
      .optional(),
    buildId: z.string().max(100).optional(),
    usageTotalUsd: z.number().nonnegative().optional(),
  }),
});
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
export type InstagramProviderOptions = {
  deadline: number;
  onRunStarted?: (runId: string) => Promise<void>;
};

/** Credentials are used only against these fixed API paths, never an input URL or redirect. */
async function providerRequestOnce(
  path: string,
  token: string,
  deadline: number,
  body?: unknown,
) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new InstagramAcquisitionFailure("timed_out");
  try {
    const response = await fetch(`https://api.apify.com/v2/${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(Math.max(1, remaining)),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new InstagramAcquisitionFailure(
        response.status === 429
          ? "rate_limited"
          : [401, 403].includes(response.status)
            ? "blocked"
            : "unavailable",
      );
    }
    const bytes = await readBoundedBytes(response, 500_000);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new InstagramAcquisitionFailure("invalid_response");
    }
  } catch (error) {
    if (error instanceof InstagramAcquisitionFailure) throw error;
    throw new InstagramAcquisitionFailure(
      Date.now() >= deadline ? "timed_out" : "unavailable",
    );
  }
}

/** Retry only reads: a lost start acknowledgement must never create another paid run. */
async function providerRequest(
  path: string,
  token: string,
  deadline: number,
  body?: unknown,
) {
  try {
    return await providerRequestOnce(path, token, deadline, body);
  } catch (error) {
    if (
      body !== undefined ||
      !(error instanceof InstagramAcquisitionFailure) ||
      !["unavailable", "rate_limited"].includes(error.acquisitionOutcome) ||
      deadline - Date.now() < 1_000
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return providerRequestOnce(path, token, deadline);
  }
}

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

export async function abortInstagramRun(runId: string) {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token || !/^[a-zA-Z0-9]+$/.test(runId)) return;
  await providerRequest(
    `actor-runs/${runId}/abort`,
    token,
    Date.now() + 2_000,
    {},
  ).catch(() => {});
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
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new InstagramAcquisitionFailure("configuration");
  let runId: string | undefined;
  let finished = false;
  try {
    let run = runSchema.safeParse(
      await providerRequest(
        "acts/apify~instagram-scraper/runs?timeout=40&maxTotalChargeUsd=0.05&maxItems=1",
        token,
        options.deadline,
        {
          directUrls: [target.url],
          resultsType: "posts",
          resultsLimit: 1,
          addParentData: false,
        },
      ),
    );
    if (!run.success) throw new InstagramAcquisitionFailure("invalid_response");
    runId = run.data.data.id;
    await options.onRunStarted?.(runId);
    for (;;) {
      const current = run.data.data;
      if (["SUCCEEDED", "TIMED-OUT"].includes(current.status)) {
        finished = true;
        if (!current.defaultDatasetId)
          throw new InstagramAcquisitionFailure(
            current.status === "TIMED-OUT" ? "timed_out" : "invalid_response",
          );
        const raw = await providerRequest(
          `datasets/${current.defaultDatasetId}/items?format=json&clean=true&limit=2&fields=${[...Object.keys(postSchema.shape), "error", "errorDescription"].join(",")}`,
          token,
          options.deadline,
        );
        // A run can time out after pushing its complete post. The dataset record
        // must pass exactly the same identity/completeness checks as a successful run.
        const post = validatePost(raw, target, current.status === "TIMED-OUT");
        return {
          post,
          runId,
          ...(current.buildId ? { buildId: current.buildId } : {}),
          ...(current.usageTotalUsd === undefined
            ? {}
            : { costUsd: current.usageTotalUsd }),
        };
      }
      if (["FAILED", "ABORTED"].includes(current.status)) {
        finished = true;
        throw new InstagramAcquisitionFailure("unavailable");
      }
      run = runSchema.safeParse(
        await providerRequest(
          `actor-runs/${runId}?waitForFinish=2`,
          token,
          options.deadline,
        ),
      );
      if (!run.success || run.data.data.id !== runId)
        throw new InstagramAcquisitionFailure("invalid_response");
    }
  } finally {
    if (runId && !finished) await abortInstagramRun(runId);
  }
}
