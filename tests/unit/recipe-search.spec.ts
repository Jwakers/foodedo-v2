import { expect, test } from "@playwright/test";

import { filterCatalogueMealsBySearch } from "../../src/lib/domain/recipe-search";
import type { CatalogueMealSummary } from "../../src/lib/domain/recipes";

const meals: CatalogueMealSummary[] = [
  {
    id: "tomato-pasta",
    version: 1,
    slug: "tomato-pasta",
    position: 0,
    title: "Tomato pasta",
    description: "A speedy weeknight dinner.",
    proteinCategory: "meat-free",
  },
  {
    id: "lemon-chicken",
    version: 1,
    slug: "lemon-chicken",
    position: 1,
    title: "Lemon chicken",
    proteinCategory: "chicken",
  },
];

test("finds recipes with a trimmed, case-insensitive title search", () => {
  expect(filterCatalogueMealsBySearch(meals, "  PASTA ")).toEqual([meals[0]]);
});

test("finds recipes by description and leaves the list unchanged for blank search", () => {
  expect(filterCatalogueMealsBySearch(meals, "weeknight")).toEqual([meals[0]]);
  expect(filterCatalogueMealsBySearch(meals, "   ")).toBe(meals);
});

test("search matches displayed words and original underscores without changing stored titles", () => {
  const underscored = [{ ...meals[0], title: "pasta_and_sauce" }];
  expect(filterCatalogueMealsBySearch(underscored, "pasta and sauce")).toEqual(
    underscored,
  );
  expect(filterCatalogueMealsBySearch(underscored, "PASTA_AND_SAUCE")).toEqual(
    underscored,
  );
  expect(underscored[0].title).toBe("pasta_and_sauce");
});
