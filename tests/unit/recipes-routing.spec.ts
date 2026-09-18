import { expect, test } from "@playwright/test";

import {
  isRecipeDetailPath,
  isRecipesSectionPath,
  parseRecipeDetailSlug,
  recipeCookPath,
  recipeDetailPath,
} from "@/lib/routing/recipes";

test("builds catalogue detail hrefs", () => {
  expect(recipeDetailPath("lemon-herb-grilled-chicken")).toBe(
    "/recipes/view?slug=lemon-herb-grilled-chicken",
  );
  expect(
    recipeDetailPath("lemon-herb-grilled-chicken", {
      catalogueMealId: "meal-1",
      catalogueVersion: 2,
    }),
  ).toBe(
    "/recipes/view?slug=lemon-herb-grilled-chicken&catalogueMealId=meal-1&catalogueVersion=2",
  );
});

test("builds Cook paths with an optional serving selection", () => {
  expect(recipeCookPath("tomato-pasta")).toBe(
    "/recipes/cook?slug=tomato-pasta",
  );
  expect(recipeCookPath("tomato-pasta", 6)).toBe(
    "/recipes/cook?slug=tomato-pasta&servings=6",
  );
  expect(
    recipeCookPath("tomato-pasta", 6, {
      catalogueMealId: "meal-2",
      catalogueVersion: 3,
    }),
  ).toBe(
    "/recipes/cook?slug=tomato-pasta&servings=6&catalogueMealId=meal-2&catalogueVersion=3",
  );
});

test("detects recipes section and detail paths", () => {
  expect(isRecipesSectionPath("/recipes")).toBe(true);
  expect(isRecipesSectionPath("/recipes/view")).toBe(true);
  expect(isRecipesSectionPath("/week")).toBe(false);

  expect(isRecipeDetailPath("/recipes")).toBe(false);
  expect(isRecipeDetailPath("/recipes/view")).toBe(true);
  expect(isRecipeDetailPath("/recipes/saved")).toBe(false);
});

test("parses the recipe slug query", () => {
  expect(parseRecipeDetailSlug("/recipes", new URLSearchParams())).toBeNull();
  expect(
    parseRecipeDetailSlug(
      "/recipes/view",
      new URLSearchParams("slug=lemon-herb-grilled-chicken"),
    ),
  ).toBe("lemon-herb-grilled-chicken");
  expect(
    parseRecipeDetailSlug(
      "/recipes/cook",
      new URLSearchParams("slug=lemon%20herb"),
    ),
  ).toBe("lemon herb");
  expect(parseRecipeDetailSlug("/week", new URLSearchParams())).toBeNull();
});
