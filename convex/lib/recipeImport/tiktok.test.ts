// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchTikTokPost, acquireTikTokSource } from "./tiktok";
import { acquireRecipeSource } from "./sources";
import { extractHtmlCandidate } from "./source";
import {
  tiktokPostUrl,
  isTikTokShareUrl,
} from "../../../src/lib/domain/social-import";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  page: vi.fn(),
  resolve: vi.fn(),
  discard: vi.fn(),
}));
vi.mock("undici", async (original) => ({
  ...(await original<typeof import("undici")>()),
  fetch: mocks.fetch,
}));
vi.mock("./source", async (original) => ({
  ...(await original<typeof import("./source")>()),
  extractUrlCandidate: mocks.page,
}));
vi.mock("./network", async (original) => ({
  ...(await original<typeof import("./network")>()),
  safeFetch: mocks.resolve,
  discardResponse: mocks.discard,
}));
const url = "https://www.tiktok.com/@cook/video/7234567890123456789";
const caption =
  "Carrot soup\nIngredients\n2 carrots\n500 ml stock\nMethod\nSimmer until tender.";
const post = {
  id: "7234567890123456789",
  webVideoUrl: url,
  text: caption,
  isSlideshow: false,
  authorMeta: { name: "cook", privateAccount: false },
  videoMeta: { coverUrl: "https://images.example.com/soup.jpg" },
};
function response(body: unknown, status = 200) {
  if (Array.isArray(body))
    body = body.map((row) => {
      const { authorMeta, videoMeta, ...rest } = row;
      return {
        ...rest,
        ...(authorMeta?.name === undefined
          ? {}
          : { "authorMeta.name": authorMeta.name }),
        ...(authorMeta?.privateAccount === undefined
          ? {}
          : { "authorMeta.privateAccount": authorMeta.privateAccount }),
        ...(videoMeta?.coverUrl === undefined
          ? {}
          : { "videoMeta.coverUrl": videoMeta.coverUrl }),
      };
    });
  mocks.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}
function acquired(value: unknown = post, status = "SUCCEEDED") {
  response({ data: { id: "run1", status, defaultDatasetId: "dataset1" } });
  response(value === undefined ? [] : [value]);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APIFY_API_TOKEN", "test-only-secret");
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  url,
  url + "/?utm_source=share",
  url.replace("www.", "m."),
  url.replace("/video/", "/photo/"),
])("canonicalizes direct TikTok post %s", (value) => {
  expect(tiktokPostUrl(value)?.id).toBe(post.id);
  expect(tiktokPostUrl(value)?.url).not.toContain("?");
});
it.each([
  "https://www.tiktok.com/@cook",
  "https://evil.tiktok.com/@cook/video/7234567890123456789",
  url.replace("tiktok.com", "tiktok.com.evil.test"),
  url.replace("https:", "ftp:"),
  url.replace("www.", "secret@www."),
  url.replace(".com/", ".com:8080/"),
  "https://www.tiktok.com/@cook/video/not-an-id",
])("rejects unsupported or deceptive URL %s", (value) =>
  expect(tiktokPostUrl(value)).toBeNull(),
);
it.each([
  "https://vm.tiktok.com/Zabc123/",
  "https://vt.tiktok.com/Zabc123/",
  "https://www.tiktok.com/t/Zabc123/",
])("recognizes bounded share URL %s", (value) =>
  expect(isTikTokShareUrl(value)).toBe(true),
);
it("requests one post, disables add-ons and uses authenticated fixed Apify endpoints", async () => {
  acquired();
  const result = await fetchTikTokPost(url + "?utm_source=share", {
    deadline: Date.now() + 45_000,
  });
  expect(result.post.text).toBe(caption);
  const [endpoint, options] = mocks.fetch.mock.calls[0];
  expect(endpoint).toContain(
    "clockworks~tiktok-video-scraper/runs?timeout=40&maxTotalChargeUsd=0.05&maxItems=1",
  );
  expect(endpoint).not.toContain("test-only-secret");
  expect(options.headers.authorization).toBe("Bearer test-only-secret");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toEqual({
    postURLs: [url],
    scrapeRelatedVideos: false,
    resultsPerPage: 1,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
  });
  const fields = new URL(mocks.fetch.mock.calls[1][0]).searchParams.get(
    "fields",
  );
  expect(fields).not.toContain("mediaUrls");
  expect(fields).not.toContain("signature");
  expect(
    new URL(mocks.fetch.mock.calls[1][0]).searchParams.get("flatten"),
  ).toBe("authorMeta,videoMeta");
});
it.each([
  "wrong_id",
  "wrong_url",
  "truncated",
  "private",
  "missing_caption",
  "null_caption",
  "multiple",
])("rejects %s before normalization", async (kind) => {
  const changed = {
    ...post,
    ...(kind === "wrong_id"
      ? { id: "7234567890123456780" }
      : kind === "wrong_url"
        ? { webVideoUrl: url.replace(post.id, "7234567890123456780") }
        : kind === "truncated"
          ? { textIsTruncated: true }
          : kind === "private"
            ? { authorMeta: { privateAccount: true } }
            : kind === "missing_caption"
              ? { text: undefined }
              : kind === "null_caption"
                ? { text: null }
                : {}),
  };
  response({
    data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "dataset1" },
  });
  response(kind === "multiple" ? [post, post] : [changed]);
  await expect(
    fetchTikTokPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({
    acquisitionOutcome: kind.startsWith("wrong")
      ? "wrong_post"
      : kind === "private"
        ? "blocked"
        : "invalid_response",
  });
});
it("routes TikTok captions through shared evidence and attribution", async () => {
  acquired();
  const result = await acquireRecipeSource({
    type: "url",
    url,
    sharedText: "Extra written instruction",
  });
  expect(result).toMatchObject({
    sourceUrl: url,
    sourceName: "TikTok",
    sourceAuthor: "cook",
    sourceImageUrls: [post.videoMeta.coverUrl],
    socialEvidence: {
      platform: "tiktok",
      mediaType: "video",
      captionComplete: true,
      linkedContentUnavailable: false,
    },
  });
  expect(result.sourceText).toContain(caption);
  expect(result.sourceText).toContain("Extra written instruction");
});
it("uses the ordinary website extractor for linked recipes and preserves publisher attribution", async () => {
  acquired({ ...post, text: "Full recipe: https://example.com/recipes/soup" });
  const publisher = extractHtmlCandidate(
    "<title>Soup recipe</title><main><h1>Soup</h1><h2>Ingredients</h2><p>2 carrots</p><p>500 ml stock</p><h2>Method</h2><p>Simmer until tender.</p></main>",
    "https://example.com/recipes/soup",
  );
  mocks.page.mockResolvedValue(publisher);
  expect(await acquireRecipeSource({ type: "url", url })).toEqual(publisher);
});
it("resolves short links before starting a paid run", async () => {
  mocks.resolve.mockResolvedValue({ url });
  acquired();
  const result = await acquireRecipeSource({
    type: "url",
    url: "https://vm.tiktok.com/Zabc123/",
  });
  expect(result.sourceUrl).toBe(url);
  expect(mocks.discard).toHaveBeenCalled();
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).postURLs).toEqual([url]);
});
it("does not start a scraper when a short link resolves outside a TikTok post", async () => {
  mocks.resolve.mockResolvedValue({ url: "https://example.com/" });
  await expect(
    acquireRecipeSource({ type: "url", url: "https://vt.tiktok.com/Zabc123/" }),
  ).rejects.toMatchObject({ code: "source_unreachable" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("classifies only known accessible captionless videos as video-only", async () => {
  acquired({ ...post, text: "" });
  await expect(
    acquireTikTokSource(url, undefined, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ code: "video_only_unsupported" });
  acquired({ ...post, text: "", isSlideshow: true });
  expect(
    (await acquireRecipeSource({ type: "url", url })).socialEvidence?.mediaType,
  ).toBe("carousel");
  acquired({ ...post, text: "", isSlideshow: undefined });
  expect(
    (await acquireRecipeSource({ type: "url", url })).socialEvidence,
  ).toBeUndefined();
});
it("keeps inaccessible linked recipes out of video-only demand", async () => {
  acquired({ ...post, text: "Recipe in bio" });
  expect(
    (await acquireRecipeSource({ type: "url", url })).socialEvidence
      ?.linkedContentUnavailable,
  ).toBe(true);
});
it("retains complete matching data from a timed-out run, but rejects an empty dataset", async () => {
  acquired(post, "TIMED-OUT");
  expect(
    (await fetchTikTokPost(url, { deadline: Date.now() + 45_000 })).post.id,
  ).toBe(post.id);
  response({
    data: { id: "run2", status: "TIMED-OUT", defaultDatasetId: "dataset2" },
  });
  response([]);
  await expect(
    fetchTikTokPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ acquisitionOutcome: "timed_out" });
});
it("treats missing configuration as unavailable without a paid call", async () => {
  vi.stubEnv("APIFY_API_TOKEN", "");
  await expect(
    fetchTikTokPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ code: "tiktok_unavailable" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("maps explicit matching not-found records without returning raw provider errors", async () => {
  acquired({ url, error: "raw private diagnostic", errorCode: "NOT_FOUND" });
  await expect(
    fetchTikTokPost(url, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({
    acquisitionOutcome: "not_found",
    message: "TikTok caption acquisition was unavailable.",
  });
});
