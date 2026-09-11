import { expect, test } from "@playwright/test";

import {
  isRecipeDetailPath,
  isRecipesSectionPath,
  parseRecipeDetailSlug,
  recipeDetailPath,
} from "@/lib/routing/recipes";

test("builds catalogue detail hrefs", () => {
  expect(recipeDetailPath("lemon-herb-grilled-chicken")).toBe(
    "/recipes/lemon-herb-grilled-chicken",
  );
});

test("detects recipes section and detail paths", () => {
  expect(isRecipesSectionPath("/recipes")).toBe(true);
  expect(isRecipesSectionPath("/recipes/lemon-herb-grilled-chicken")).toBe(
    true,
  );
  expect(isRecipesSectionPath("/week")).toBe(false);

  expect(isRecipeDetailPath("/recipes")).toBe(false);
  expect(isRecipeDetailPath("/recipes/lemon-herb-grilled-chicken")).toBe(true);
  expect(isRecipeDetailPath("/recipes/saved")).toBe(true);
});

test("parses the first recipe slug segment", () => {
  expect(parseRecipeDetailSlug("/recipes")).toBeNull();
  expect(parseRecipeDetailSlug("/recipes/lemon-herb-grilled-chicken")).toBe(
    "lemon-herb-grilled-chicken",
  );
  expect(parseRecipeDetailSlug("/recipes/lemon%20herb/edit")).toBe(
    "lemon herb",
  );
  expect(parseRecipeDetailSlug("/week")).toBeNull();
});
