// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchInstagramPost } from "./instagramProvider";
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("undici", async (original) => ({
  ...(await original<typeof import("undici")>()),
  fetch: transport.fetch,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APIFY_API_TOKEN", "secret-for-test-only");
});
afterEach(() => vi.unstubAllEnvs());
const url = "https://www.instagram.com/reel/Cexample123/";
function response(body: unknown, status = 200) {
  transport.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}
const run = (status = "SUCCEEDED") => ({
  data: { id: "run1", status, defaultDatasetId: "dataset1", buildId: "build1" },
});
const post = {
  url,
  shortCode: "Cexample123",
  type: "Video",
  caption: "Ingredients: 2 carrots. Method: Boil until tender.",
  ownerUsername: "cook",
};
it("requests only the canonical post, bounds charges, and keeps credentials out of URLs", async () => {
  response(run());
  response([post]);
  const onRunStarted = vi.fn(async () => {});
  expect(
    await fetchInstagramPost(url + "?igsh=tracking", {
      deadline: Date.now() + 45_000,
      onRunStarted,
    }),
  ).toMatchObject({ post, runId: "run1" });
  expect(onRunStarted).toHaveBeenCalledWith("run1");
  const [endpoint, options] = transport.fetch.mock.calls[0];
  expect(endpoint).not.toContain("secret-for-test-only");
  expect(endpoint).toContain("maxTotalChargeUsd=0.05");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toMatchObject({
    directUrls: [url],
    resultsLimit: 1,
    resultsType: "posts",
  });
  expect(options.headers.authorization).toBe("Bearer secret-for-test-only");
  const fields = new URL(transport.fetch.mock.calls[1][0]).searchParams
    .get("fields")!
    .split(",");
  expect(fields).toContain("caption");
  expect(fields).toContain("shortCode");
  expect(fields).toContain("captionIsTruncated");
  expect(fields).toContain("error");
  expect(fields).not.toContain("latestComments");
  expect(fields).not.toContain("videoUrl");
});
it("waits for a pending run without starting another paid extraction", async () => {
  response(run("RUNNING"));
  response(run());
  response([post]);
  await fetchInstagramPost(url, { deadline: Date.now() + 45_000 });
  expect(
    transport.fetch.mock.calls.filter(
      ([, options]) => options.method === "POST",
    ),
  ).toHaveLength(1);
  expect(transport.fetch.mock.calls[1][0]).toContain(
    "actor-runs/run1?waitForFinish=2",
  );
});
it.each(["wrong_shortcode", "wrong_url", "truncated", "private", "multiple"])(
  "rejects %s results rather than importing another or incomplete post",
  async (kind) => {
    response(run());
    response(
      kind === "multiple"
        ? [post, post]
        : [
            {
              ...post,
              ...(kind === "wrong_shortcode"
                ? { shortCode: "Other12345" }
                : kind === "wrong_url"
                  ? { url: "https://www.instagram.com/reel/Other12345/" }
                  : kind === "truncated"
                    ? { captionIsTruncated: true }
                    : { isPrivate: true }),
            },
          ],
    );
    await expect(
      fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
    ).rejects.toMatchObject({
      acquisitionOutcome: kind.startsWith("wrong")
        ? "wrong_post"
        : kind === "private"
          ? "blocked"
          : "invalid_response",
    });
  },
);
it.each([403, 429, 500])(
  "maps HTTP %i to a source failure without leaking the raw provider error",
  async (status) => {
    response(
      { error: { message: "secret-for-test-only and raw response" } },
      status,
    );
    await expect(
      fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
    ).rejects.toMatchObject({
      acquisitionOutcome:
        status === 403
          ? "blocked"
          : status === 429
            ? "rate_limited"
            : "unavailable",
      message: "Instagram caption acquisition was unavailable.",
    });
  },
);
it("does not re-abort a run that has already timed out", async () => {
  response(run("RUNNING"));
  response(run("TIMED-OUT"));
  response([]);
  await expect(
    fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ acquisitionOutcome: "timed_out" });
  expect(
    transport.fetch.mock.calls.some(([endpoint]) =>
      endpoint.includes("/abort"),
    ),
  ).toBe(false);
});
it("still aborts an active run when the import attempt is no longer accepted", async () => {
  response(run("RUNNING"));
  response({});
  await expect(
    fetchInstagramPost(url, {
      deadline: Date.now() + 45_000,
      onRunStarted: async () => {
        throw new Error("Inactive attempt");
      },
    }),
  ).rejects.toThrow("Inactive attempt");
  expect(transport.fetch.mock.calls.at(-1)?.[0]).toContain(
    "actor-runs/run1/abort",
  );
});
it("starts no provider request without credentials or for an unsupported URL", async () => {
  vi.stubEnv("APIFY_API_TOKEN", "");
  await expect(
    fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ acquisitionOutcome: "configuration" });
  await expect(
    fetchInstagramPost("http://localhost/", { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ code: "invalid_url" });
  expect(transport.fetch).not.toHaveBeenCalled();
});

it("recovers a complete matching post pushed before the remote run timed out", async () => {
  response(run("TIMED-OUT"));
  response([post]);
  await expect(
    fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
  ).resolves.toMatchObject({ post });
});
it.each(["wrong_post", "truncated"])(
  "never trusts %s content from a timed-out run",
  async (kind) => {
    response(run("TIMED-OUT"));
    response([
      {
        ...post,
        ...(kind === "wrong_post"
          ? { shortCode: "Other12345" }
          : { captionIsTruncated: true }),
      },
    ]);
    await expect(
      fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
    ).rejects.toMatchObject({
      acquisitionOutcome:
        kind === "wrong_post" ? "wrong_post" : "invalid_response",
    });
  },
);
it("recognises an explicit missing-post result without exposing the raw provider description", async () => {
  response(run());
  response([
    { url, error: "not_found", errorDescription: "secret-for-test-only" },
  ]);
  await expect(
    fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({
    acquisitionOutcome: "not_found",
    message: "Instagram caption acquisition was unavailable.",
  });
});
it("retries a transient read on the existing run without starting another extraction", async () => {
  response(run("RUNNING"));
  response({}, 503);
  response(run());
  response([post]);
  await expect(
    fetchInstagramPost(url, { deadline: Date.now() + 45_000 }),
  ).resolves.toMatchObject({ post });
  expect(
    transport.fetch.mock.calls.filter(([, o]) => o.method === "POST"),
  ).toHaveLength(1);
  expect(transport.fetch.mock.calls[1][0]).toEqual(
    transport.fetch.mock.calls[2][0],
  );
});
