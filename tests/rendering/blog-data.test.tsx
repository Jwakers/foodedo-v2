// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getBlogArticle,
  getPublishedPosts,
} from "../../src/features/blog/sanity.server";

afterEach(() => vi.restoreAllMocks());

test("serves a newly published slug on demand and refreshes the article listing", async () => {
  const article = {
    _id: "newly-published",
    slug: "a-new-article-after-deployment",
    title: "A new dinner idea",
    publishedAt: "2026-10-21T12:00:00Z",
    body: [],
  };
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ result: article }))
    .mockResolvedValueOnce(Response.json({ result: [article] }));
  expect(await getBlogArticle(article.slug)).toMatchObject(article);
  expect(await getPublishedPosts()).toMatchObject([
    {
      slug: article.slug,
      title: article.title,
      publishedAt: article.publishedAt,
    },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const request = new URL(String(fetcher.mock.calls[0][0]));
  expect(JSON.parse(request.searchParams.get("$slug")!)).toBe(article.slug);
});

test("only a successful empty CMS result means not found", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ result: null }))
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ error: "Unavailable" }));
  expect(await getBlogArticle("missing-article")).toBeNull();
  await expect(
    getBlogArticle("temporarily-unavailable-article"),
  ).rejects.toThrow("503");
  await expect(getBlogArticle("malformed-response-article")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test("local guides remain readable during a CMS outage", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("CMS unavailable"));
  expect(
    await getBlogArticle("how-to-build-a-weekly-meal-plan-in-15-minutes"),
  ).toHaveProperty("title", "How to Build a Weekly Meal Plan in 15 Minutes");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(getPublishedPosts()).rejects.toThrow("CMS unavailable");
});
