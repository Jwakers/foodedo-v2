import { expect, test } from "@playwright/test";

import {
  isRecipeDetailPath,
  isRecipesSectionPath,
  parsePersonalRecipeId,
  parseRecipeDetailSlug,
  parseRecipeServings,
  personalRecipeCookPath,
  personalRecipeDetailPath,
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
  expect(
    recipeDetailPath(
      "lemon-herb-grilled-chicken",
      { catalogueMealId: "meal-1", catalogueVersion: 2 },
      2,
    ),
  ).toBe(
    "/recipes/view?slug=lemon-herb-grilled-chicken&servings=2&catalogueMealId=meal-1&catalogueVersion=2",
  );
});

test("parses only safe explicit serving selections", () => {
  expect(parseRecipeServings("2")).toBe(2);
  expect(parseRecipeServings(null)).toBeNull();
  expect(parseRecipeServings("2.5")).toBeNull();
  expect(parseRecipeServings("0")).toBeNull();
  expect(parseRecipeServings("1001")).toBeNull();
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

test("builds and parses personal recipe routes", () => {
  expect(personalRecipeDetailPath("recipe-1", 4)).toBe(
    "/recipes/view?recipeId=recipe-1&servings=4",
  );
  expect(personalRecipeCookPath("recipe-1", 2)).toBe(
    "/recipes/cook?recipeId=recipe-1&servings=2",
  );
  expect(parsePersonalRecipeId(new URLSearchParams("recipeId=recipe-1"))).toBe(
    "recipe-1",
  );
  expect(parsePersonalRecipeId(new URLSearchParams())).toBeNull();
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
