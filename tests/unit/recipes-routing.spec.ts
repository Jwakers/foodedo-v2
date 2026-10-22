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
  catalogueBrowsePath,
  publicRecipePath,
} from "@/lib/routing/recipes";

test("canonical browsing preserves native query routes and ignores conflicting slug queries on web", () => {
  const previous = process.env.NEXT_PUBLIC_CAPACITOR_BUILD;
  try {
    process.env.NEXT_PUBLIC_CAPACITOR_BUILD = "false";
    expect(catalogueBrowsePath("beef-lasagne")).toBe("/recipes/beef-lasagne");
    expect(publicRecipePath("beef-lasagne")).toBe("/recipes/beef-lasagne");
    expect(
      parseRecipeDetailSlug(
        "/recipes/beef-lasagne",
        new URLSearchParams("slug=other-recipe"),
      ),
    ).toBe("beef-lasagne");
    process.env.NEXT_PUBLIC_CAPACITOR_BUILD = "true";
    expect(catalogueBrowsePath("beef-lasagne")).toBe(
      "/recipes/view?slug=beef-lasagne",
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_CAPACITOR_BUILD;
    else process.env.NEXT_PUBLIC_CAPACITOR_BUILD = previous;
  }
});

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
  expect(isRecipeDetailPath("/recipes/beef-lasagne")).toBe(true);
  expect(isRecipeDetailPath("/recipes/import")).toBe(false);
  expect(isRecipeDetailPath("/recipes/edit")).toBe(false);
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

test("keeps household plan servings separate from local cook servings", () => {
  expect(personalRecipeCookPath("snapshot-1", 2, 4)).toBe(
    "/recipes/cook?recipeId=snapshot-1&servings=2&planServings=4",
  );
  expect(personalRecipeDetailPath("snapshot-1", 2, 4)).toBe(
    "/recipes/view?recipeId=snapshot-1&servings=2&planServings=4",
  );
});
