import { expect, test } from "@playwright/test";
import { recipeDirectoryPage } from "../../src/lib/domain/recipe-directory";
import type { CatalogueMealSummary } from "../../src/lib/domain/recipes";

test("numbered discovery reaches every recipe once and matches recommended order", () => {
  const meals = Array.from({ length: 43 }, (_, position) => ({
    id: `id-${position}`,
    slug: `meal-${position}`,
    position,
  })) as CatalogueMealSummary[];
  const pages = [1, 2, 3].map((page) => recipeDirectoryPage(meals, page)!);
  expect(pages.map((page) => page.page.length)).toEqual([20, 20, 3]);
  expect(
    pages.flatMap((page) => page.page.map((meal) => meal.position)),
  ).toEqual(Array.from({ length: 43 }, (_, i) => 42 - i));
  expect(pages.map((page) => page.isDone)).toEqual([false, false, true]);
  expect(meals[0].position).toBe(0);
  for (const page of [0, -1, 1.5, 4, Number.MAX_SAFE_INTEGER + 1])
    expect(recipeDirectoryPage(meals, page)).toBeNull();
});

test("an empty catalogue has a valid first page but no continuation", () => {
  expect(recipeDirectoryPage([], 1)).toEqual({
    page: [],
    isDone: true,
    pageNumber: 1,
    totalPages: 1,
  });
  expect(recipeDirectoryPage([], 2)).toBeNull();
});
