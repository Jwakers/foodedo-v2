// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { acquireInstagramSource } from "./instagram";
import { acquireRecipeSource } from "./sources";
import { extractHtmlCandidate } from "./source";
import { ImportFailure } from "./contracts";
import { instagramPostUrl } from "../../../src/lib/domain/social-import";
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  page: vi.fn(),
  fetch: vi.fn(),
  discard: vi.fn(),
}));
vi.mock("./instagramProvider", async (original) => ({
  ...(await original<typeof import("./instagramProvider")>()),
  fetchInstagramPost: mocks.post,
}));
vi.mock("./source", async (original) => ({
  ...(await original<typeof import("./source")>()),
  extractUrlCandidate: mocks.page,
}));
vi.mock("./network", async (original) => ({
  ...(await original<typeof import("./network")>()),
  safeFetch: mocks.fetch,
  discardResponse: mocks.discard,
}));
const url = "https://www.instagram.com/reel/Cexample123/";
const caption =
  "Carrot soup\nIngredients\n2 carrots\n500 ml stock\nMethod\nSimmer until tender.";
const post = {
  url,
  shortCode: "Cexample123",
  caption,
  type: "Video",
  ownerUsername: "cook",
  displayUrl: "https://images.example.com/soup.jpg",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({ post, runId: "run1" });
});
it.each([
  "https://instagram.com/p/Cexample123?igsh=tracking",
  "https://www.instagram.com/reel/Cexample123/",
  "https://m.instagram.com/reels/Cexample123/?utm_source=share",
  "https://www.instagram.com/cook/reel/Cexample123/",
  "https://instagram.com/tv/Cexample123/",
])("accepts and canonicalizes %s", (value) =>
  expect(instagramPostUrl(value)?.shortcode).toBe("Cexample123"),
);
it.each([
  "https://instagram.com.evil.test/reel/Cexample123/",
  "https://instagram.com/cook/",
  "https://instagram.com/stories/cook/12345/",
  "ftp://instagram.com/reel/Cexample123/",
  "https://user:secret@instagram.com/reel/Cexample123/",
  "https://instagram.com:8080/reel/Cexample123/",
])("rejects unsupported or deceptive URL %s", (value) =>
  expect(instagramPostUrl(value)).toBeNull(),
);
it("routes captions into the shared recipe evidence contract with creator and image attribution", async () => {
  const result = await acquireRecipeSource({
    type: "url",
    url: url + "?igsh=tracking",
    sharedText: "User supplied context",
  });
  expect(result).toMatchObject({
    sourceUrl: url,
    sourceName: "Instagram",
    sourceAuthor: "cook",
    sourceImageUrls: [post.displayUrl],
    socialEvidence: {
      platform: "instagram",
      mediaType: "video",
      captionComplete: true,
      linkedContentUnavailable: false,
    },
  });
  expect(result.sourceText).toContain(caption);
  expect(result.sourceText).toContain("User supplied context");
});
it("follows an Instagram-wrapped recipe link and keeps publisher attribution", async () => {
  const blog = "https://example.com/recipes/soup";
  mocks.post.mockResolvedValue({
    post: {
      ...post,
      caption: `Recipe: https://l.instagram.com/?u=${encodeURIComponent(blog)}`,
    },
    runId: "run1",
  });
  mocks.page.mockResolvedValue(
    extractHtmlCandidate(
      "<article><h1>Soup</h1><h2>Ingredients</h2><p>2 carrots</p><h2>Method</h2><p>Simmer.</p></article>",
      blog,
    ),
  );
  const onAcquired = vi.fn(async () => {});
  const result = await acquireInstagramSource(url, undefined, {
    deadline: Date.now() + 45_000,
    onAcquired,
  });
  expect(result.sourceUrl).toBe(blog);
  expect(result.sourceName).toBe("example.com");
  expect(mocks.page).toHaveBeenCalledWith(blog, expect.any(Number));
  expect(onAcquired).toHaveBeenCalledWith(
    expect.objectContaining({ linkedPagesTried: 1, outcome: "acquired" }),
  );
  expect(JSON.stringify(onAcquired.mock.calls)).not.toContain("2 carrots");
});
it("retains partial caption evidence when a linked source is blocked without classifying it as video-only", async () => {
  mocks.post.mockResolvedValue({
    post: { ...post, caption: "Recipe: https://example.com/recipe/soup" },
    runId: "run1",
  });
  mocks.page.mockRejectedValue(new ImportFailure("source_blocked", "Blocked"));
  expect(
    (
      await acquireInstagramSource(url, undefined, {
        deadline: Date.now() + 45_000,
      })
    ).socialEvidence?.linkedContentUnavailable,
  ).toBe(true);
});
it("does not turn a link-in-bio recipe into a video-only signal or crawl a profile", async () => {
  mocks.post.mockResolvedValue({
    post: {
      ...post,
      caption: "My chicken curry. Full recipe at the link in bio.",
    },
    runId: "run1",
  });
  expect(
    (
      await acquireInstagramSource(url, undefined, {
        deadline: Date.now() + 45_000,
      })
    ).socialEvidence?.linkedContentUnavailable,
  ).toBe(true);
  expect(mocks.page).not.toHaveBeenCalled();
});
it("reports a known accessible video without caption text as unsupported video", async () => {
  mocks.post.mockResolvedValue({
    post: { ...post, caption: "" },
    runId: "run1",
  });
  await expect(
    acquireInstagramSource(url, undefined, { deadline: Date.now() + 45_000 }),
  ).rejects.toMatchObject({ code: "video_only_unsupported" });
});
it("limits outgoing recipe page attempts and retains the incomplete-acquisition signal", async () => {
  mocks.post.mockResolvedValue({
    post: {
      ...post,
      caption: Array.from(
        { length: 5 },
        (_, i) => `Recipe: https://example.com/${i}`,
      ).join("\n"),
    },
    runId: "run1",
  });
  mocks.page.mockRejectedValue(new ImportFailure("source_blocked", "Blocked"));
  const result = await acquireInstagramSource(url, undefined, {
    deadline: Date.now() + 45_000,
  });
  expect(mocks.page).toHaveBeenCalledTimes(3);
  expect(result.socialEvidence?.linkedContentUnavailable).toBe(true);
});
it("resolves shared redirect links and releases the response before acquisition", async () => {
  const response = { url };
  mocks.fetch.mockResolvedValue(response);
  await acquireInstagramSource(
    "https://www.instagram.com/share/reel/shareExample/",
    undefined,
    { deadline: Date.now() + 45_000 },
  );
  expect(mocks.discard).toHaveBeenCalledWith(response);
  expect(mocks.post).toHaveBeenCalledWith(
    url,
    expect.objectContaining({ deadline: expect.any(Number) }),
  );
});

it("follows an explicitly written www recipe link without requiring a scheme", async () => {
  const { rankedRecipeLinks, extractHttpLinks } =
    await import("./linkedSources");
  expect(
    rankedRecipeLinks("Full recipe: www.publisher.example/recipes/soup"),
  ).toEqual(["https://www.publisher.example/recipes/soup"]);
  expect(
    extractHttpLinks(
      "Email cook@www.publisher.example or cook@sub.www.publisher.example is not a recipe link",
    ),
  ).toEqual([]);
});
