"use node";
import { fetch } from "undici";
import { z } from "zod";
import { ImportFailure } from "./contracts";
import { readBoundedBytes } from "./network";

export type SocialProviderOutcome =
  | "not_found"
  | "configuration"
  | "blocked"
  | "rate_limited"
  | "unavailable"
  | "wrong_post"
  | "invalid_response"
  | "timed_out";
export type ApifyPlatform = "instagram" | "tiktok";
export class SocialAcquisitionFailure extends ImportFailure {
  constructor(
    readonly platform: ApifyPlatform,
    readonly acquisitionOutcome: SocialProviderOutcome,
  ) {
    super(
      acquisitionOutcome === "configuration"
        ? `${platform}_unavailable`
        : acquisitionOutcome === "timed_out"
          ? "timed_out"
          : acquisitionOutcome === "blocked" ||
              acquisitionOutcome === "rate_limited"
            ? "source_blocked"
            : "source_unreachable",
      `${platform === "instagram" ? "Instagram" : "TikTok"} caption acquisition was unavailable.`,
    );
  }
}
export type ApifyProviderOptions = {
  deadline: number;
  onRunStarted?: (runId: string) => Promise<void>;
};
type FailureFactory = (
  outcome: SocialProviderOutcome,
) => SocialAcquisitionFailure;
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
/** Credentials are used only against these fixed API paths, never an input URL or redirect. */
async function providerRequestOnce(
  fail: FailureFactory,
  path: string,
  token: string,
  deadline: number,
  body?: unknown,
) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw fail("timed_out");
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
      throw fail(
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
      throw fail("invalid_response");
    }
  } catch (error) {
    if (error instanceof SocialAcquisitionFailure) throw error;
    throw fail(Date.now() >= deadline ? "timed_out" : "unavailable");
  }
}

/** Retry only reads: a lost start acknowledgement must never create another paid run. */
async function providerRequest(
  fail: FailureFactory,
  path: string,
  token: string,
  deadline: number,
  body?: unknown,
) {
  try {
    return await providerRequestOnce(fail, path, token, deadline, body);
  } catch (error) {
    if (
      body !== undefined ||
      !(error instanceof SocialAcquisitionFailure) ||
      !["unavailable", "rate_limited"].includes(error.acquisitionOutcome) ||
      deadline - Date.now() < 1_000
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return providerRequestOnce(fail, path, token, deadline);
  }
}

export async function abortApifyRun(runId: string) {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token || !/^[a-zA-Z0-9]+$/.test(runId)) return;
  await providerRequest(
    (outcome) => new SocialAcquisitionFailure("instagram", outcome),
    `actor-runs/${runId}/abort`,
    token,
    Date.now() + 2_000,
    {},
  ).catch(() => {});
}

/** One bounded target per run; adapters own Actor inputs and post validation. */
export async function runApifyPost<T>({
  actor,
  input,
  fields,
  flatten,
  validate,
  fail,
  ...options
}: ApifyProviderOptions & {
  actor: "apify~instagram-scraper" | "clockworks~tiktok-video-scraper";
  input: Record<string, unknown>;
  fields: string[];
  flatten?: string[];
  validate: (raw: unknown, timedOut: boolean) => T;
  fail: FailureFactory;
}) {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw fail("configuration");
  let runId: string | undefined;
  let finished = false;
  try {
    let run = runSchema.safeParse(
      await providerRequest(
        fail,
        `acts/${actor}/runs?timeout=40&maxTotalChargeUsd=0.05&maxItems=1`,
        token,
        options.deadline,
        input,
      ),
    );
    if (!run.success) throw fail("invalid_response");
    runId = run.data.data.id;
    await options.onRunStarted?.(runId);
    for (;;) {
      const current = run.data.data;
      if (["SUCCEEDED", "TIMED-OUT"].includes(current.status)) {
        finished = true;
        if (!current.defaultDatasetId)
          throw fail(
            current.status === "TIMED-OUT" ? "timed_out" : "invalid_response",
          );
        const raw = await providerRequest(
          fail,
          `datasets/${current.defaultDatasetId}/items?format=json&clean=true&limit=2&fields=${fields.join(",")}${flatten?.length ? `&flatten=${flatten.join(",")}` : ""}`,
          token,
          options.deadline,
        );
        // A run can time out after pushing its complete post. The dataset record
        // must pass exactly the same identity/completeness checks as a successful run.
        const post = validate(raw, current.status === "TIMED-OUT");
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
        throw fail("unavailable");
      }
      run = runSchema.safeParse(
        await providerRequest(
          fail,
          `actor-runs/${runId}?waitForFinish=2`,
          token,
          options.deadline,
        ),
      );
      if (!run.success || run.data.data.id !== runId)
        throw fail("invalid_response");
    }
  } finally {
    if (runId && !finished) await abortApifyRun(runId);
  }
}
