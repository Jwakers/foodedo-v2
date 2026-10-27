// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { query, cached } = vi.hoisted(() => ({
  query: vi.fn(),
  cached: vi.fn(),
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = query;
  },
}));
vi.mock("next/cache", () => ({ unstable_cache: cached }));
import {
  getPublishedRecipePage,
  getPublicRecipe,
  getPublishedRecipes,
} from "../../src/features/public-recipes/catalogue.server";

beforeEach(() => {
  query.mockReset();
  cached.mockReset().mockImplementation((read) => read);
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
});
afterEach(() => vi.unstubAllEnvs());

test("new slugs bypass the listing and use the 24-hour cache keyed by deployment and slug", async () => {
  query.mockResolvedValue({ slug: "new-after-build" });
  expect(await getPublicRecipe("new-after-build")).toEqual({
    slug: "new-after-build",
  });
  expect(query).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    slug: "new-after-build",
  });
  expect(cached).toHaveBeenCalledWith(
    expect.any(Function),
    ["public-recipe-detail-v1", "https://test.convex.cloud"],
    { revalidate: 86400 },
  );
  const read = cached.mock.calls[0][0];
  await read("another-slug");
  expect(query).toHaveBeenLastCalledWith(expect.anything(), {
    slug: "another-slug",
  });
});

test("the complete published directory remains cached for sitemap and static paths", async () => {
  query.mockResolvedValue({ meals: [{ slug: "published-meal" }] });
  expect(await getPublishedRecipes()).toEqual([{ slug: "published-meal" }]);
  expect(cached).toHaveBeenCalledWith(
    expect.any(Function),
    ["public-recipes-list-v1", "https://test.convex.cloud"],
    { revalidate: 1800 },
  );
  query.mockResolvedValue(null);
  expect(await getPublishedRecipes()).toEqual([]);
});

test("only a successful null means missing; backend errors propagate", async () => {
  query
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("Backend unavailable"));
  expect(await getPublicRecipe("missing-meal")).toBeNull();
  await expect(getPublicRecipe("unavailable-meal")).rejects.toThrow(
    "Backend unavailable",
  );
  expect(await getPublicRecipe("invalid/slug")).toBeNull();
  expect(query).toHaveBeenCalledTimes(2);
});

test("the public directory slices a shared catalogue snapshot without exposing a cursor", async () => {
  const meals = Array.from({ length: 25 }, (_, index) => ({
    slug: `meal-${index}`,
    position: index,
  }));
  query.mockResolvedValue({ meals });
  const result = (await getPublishedRecipePage())!;
  expect(result.page).toHaveLength(20);
  expect(result.page[0].slug).toBe("meal-24");
  expect(result.page.at(-1)?.slug).toBe("meal-5");
  expect(result.isDone).toBe(false);
  expect(result).not.toHaveProperty("continueCursor");
  expect(query).toHaveBeenCalledExactlyOnceWith(expect.anything(), {});
});
