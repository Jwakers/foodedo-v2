// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportFailure } from "./contracts";
import { extractHtmlCandidate } from "./source";
import {
  extractHttpLinks,
  extractYouTubeWatchSnippet,
  maybeAcquireYouTubeSource,
  parseYouTubeVideoId,
  rankedRecipeLinks,
} from "./youtube";

const network = vi.hoisted(() => ({
  fetch: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
}));
vi.mock("./network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./network")>()),
  safeFetch: network.fetch,
  readBoundedBytes: network.read,
  discardResponse: network.discard,
}));
const id = "l8DMvfFUVQM";
const recipeUrl =
  "https://www.andy-cooks.com/blogs/recipes/chicken-tikka-masala";
const description = `Recipe: ${recipeUrl}\nFOLLOW:\nAndy's Instagram: https://www.instagram.com/andyhearnden/\nWebsite with all Andy's recipes: https://www.andy-cooks.com/`;
function watchPage(text = description, videoId = id) {
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId, title: "The Best Curry Recipe?", author: "Back of House", shortDescription: text } })};</script>`;
}
const recipeHtml = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Chicken tikka masala", recipeIngredient: ["500 g chicken"], recipeInstructions: ["Cook the chicken."] })}</script>`;
function respond(
  body: string,
  url = "https://www.youtube.com/watch?v=" + id,
  contentType = "text/html",
) {
  network.fetch.mockResolvedValueOnce({
    url,
    headers: new Headers({ "content-type": contentType }),
  });
  network.read.mockResolvedValueOnce(new TextEncoder().encode(body));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("YOUTUBE_DATA_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("YouTube URLs", () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}&t=1s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=share`,
    `https://youtube.com/shorts/${id}`,
    `https://youtube.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
  ])("parses %s", (url) => expect(parseYouTubeVideoId(url)).toBe(id));
  it.each([
    `https://youtube.com.evil.test/watch?v=${id}`,
    "https://youtube.com/watch?v=bad",
    `https://youtu.be/${id}/extra`,
  ])("rejects %s", (url) => expect(parseYouTubeVideoId(url)).toBeNull());
  it("rejects unsafe input before rewriting it to a safe watch URL", () => {
    expect(() =>
      parseYouTubeVideoId(`ftp://youtube.com/watch?v=${id}`),
    ).toThrow(ImportFailure);
    expect(() =>
      parseYouTubeVideoId(`https://user:password@youtube.com/watch?v=${id}`),
    ).toThrow(ImportFailure);
  });
});

it("extracts links, preserving balanced URL parentheses and removing prose punctuation", () => {
  expect(
    extractHttpLinks(
      "Recipe: https://example.com/recipe). https://example.com/food_(dish). https://example.com/recipe#method",
    ),
  ).toEqual(["https://example.com/recipe", "https://example.com/food_(dish)"]);
});
it("prioritizes the recipe over earlier ads, profiles, homepages and unrelated links", () => {
  expect(
    rankedRecipeLinks(
      `Shop: https://shop.example.com/tools\nhttps://news.example.com/latest\n${description}`,
    )[0],
  ).toBe(recipeUrl);
  expect(rankedRecipeLinks(description)).toEqual([recipeUrl]);
});
it("unwraps YouTube redirect links without fetching the wrapper", () => {
  expect(
    rankedRecipeLinks(
      `Recipe: https://www.youtube.com/redirect?q=${encodeURIComponent(recipeUrl)}`,
    ),
  ).toEqual([recipeUrl]);
});
it("reads the full watch-page description as data including escaped quotes and braces", () => {
  const text = 'Ingredients {test} "quoted" \\ text\nRecipe: ' + recipeUrl;
  expect(extractYouTubeWatchSnippet(watchPage(text), id)?.description).toBe(
    text,
  );
  expect(
    extractYouTubeWatchSnippet(watchPage(text, "dQw4w9WgXcQ"), id),
  ).toBeNull();
  expect(
    extractYouTubeWatchSnippet(
      '<meta name="description" content="truncated">',
      id,
    ),
  ).toBeNull();
  expect(
    extractYouTubeWatchSnippet("ytInitialPlayerResponse = {broken", id),
  ).toBeNull();
});
it("routes the reported curry video to the blog using the public fallback without an API key", async () => {
  respond(watchPage());
  respond(recipeHtml, recipeUrl);
  const result = await maybeAcquireYouTubeSource(`https://youtu.be/${id}`);
  expect(result?.sourceUrl).toBe(recipeUrl);
  expect(result?.blocks).toEqual(
    extractHtmlCandidate(recipeHtml, recipeUrl).blocks,
  );
  expect(network.fetch).toHaveBeenCalledTimes(2);
  expect(network.fetch.mock.calls[1][3]).toEqual(expect.any(Number));
});
it("uses API metadata when available, with no watch-page request", async () => {
  vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-key");
  respond(
    JSON.stringify({ items: [{ snippet: { description } }] }),
    "https://www.googleapis.com/",
    "application/json",
  );
  respond(recipeHtml, recipeUrl);
  expect(
    (await maybeAcquireYouTubeSource(`https://youtu.be/${id}`))?.sourceUrl,
  ).toBe(recipeUrl);
  expect(network.fetch.mock.calls[0][2]).toBe("json");
  expect(network.fetch).toHaveBeenCalledTimes(2);
});
it.each(["quota", "malformed", "empty"])(
  "falls back from %s API responses",
  async (kind) => {
    vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-key");
    if (kind === "quota")
      network.fetch.mockRejectedValueOnce(
        new ImportFailure("source_blocked", "Quota"),
      );
    else respond(kind === "malformed" ? "invalid" : '{"items":[]}');
    respond(watchPage());
    respond(recipeHtml, recipeUrl);
    expect(
      (await maybeAcquireYouTubeSource(`https://youtu.be/${id}`))?.sourceUrl,
    ).toBe(recipeUrl);
  },
);
it("continues past a readable non-recipe and a blocked page", async () => {
  respond(
    watchPage(
      `Recipe: https://example.com/first\nRecipe: https://example.com/second\n${description}`,
    ),
  );
  respond("<h1>Subscribe to our newsletter</h1>", "https://example.com/first");
  network.fetch.mockRejectedValueOnce(
    new ImportFailure("source_blocked", "Blocked"),
  );
  respond(recipeHtml, recipeUrl);
  expect(
    (await maybeAcquireYouTubeSource(`https://youtu.be/${id}`))?.sourceUrl,
  ).toBe(recipeUrl);
  expect(network.fetch).toHaveBeenCalledTimes(4);
});
it("caps link attempts and falls back to description evidence with creator attribution", async () => {
  const text =
    Array.from(
      { length: 8 },
      (_, i) => `Recipe: https://example.com/${i}`,
    ).join("\n") + "\nIngredients\n500 g chicken\nMethod\nCook the chicken.";
  respond(watchPage(text));
  for (let i = 0; i < 3; i++)
    network.fetch.mockRejectedValueOnce(
      new ImportFailure("source_blocked", "Blocked"),
    );
  const candidate = await maybeAcquireYouTubeSource(
    `https://youtu.be/${id}?t=1`,
  );
  expect(candidate).toMatchObject({
    sourceName: "YouTube",
    sourceAuthor: "Back of House",
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
  });
  expect(candidate?.sourceText).toContain("500 g chicken");
  expect(network.fetch).toHaveBeenCalledTimes(4);
});
it("rejects unavailable pages but retains accessible title-only video context for classification", async () => {
  respond("<h1>Sign in</h1>");
  await expect(
    maybeAcquireYouTubeSource(`https://youtu.be/${id}`),
  ).rejects.toMatchObject({ code: "unsupported_content" });
  respond(watchPage(""));
  expect(
    await maybeAcquireYouTubeSource(`https://youtu.be/${id}`),
  ).toMatchObject({
    socialEvidence: {
      platform: "youtube",
      mediaType: "video",
      captionComplete: true,
      linkedContentUnavailable: false,
    },
  });
});
it("leaves ordinary websites with the existing adapter", async () => {
  expect(
    await maybeAcquireYouTubeSource("https://example.com/recipe"),
  ).toBeNull();
  expect(network.fetch).not.toHaveBeenCalled();
});

it("scores each link using its own label when a line mixes shop and recipe links", () => {
  expect(
    rankedRecipeLinks(
      "Shop: https://shop.example.com/tools | Full recipe: https://example.com/soup",
    ),
  ).toEqual(["https://example.com/soup"]);
});

it.each([
  "<article><h1>Carrot soup</h1><p>Ingredients:<br>2 carrots</p><p>Method:<br>Boil the carrots until tender.</p></article>",
  "<article><h1>Carrot soup</h1><h2>Ingredients for 4 servings</h2><p>2 carrots</p><h2>Method (30 minutes)</h2><p>Boil the carrots until tender.</p></article>",
])(
  "keeps readable linked recipes with qualified or embedded recipe headings",
  async (html) => {
    const url = "https://example.com/soup";
    respond(watchPage(`Recipe: ${url}`));
    respond(html, url);
    const candidate = await maybeAcquireYouTubeSource(`https://youtu.be/${id}`);
    expect(candidate?.sourceUrl).toBe(url);
    expect(candidate?.sourceText).toContain("2 carrots");
    expect(candidate?.sourceText).toContain("Boil the carrots until tender.");
  },
);
