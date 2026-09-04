import { expect, test } from "@playwright/test";
import {
  prepareRecipeContent,
  prepareStandardCatalogue,
  RecipeValidationError,
} from "../../src/lib/domain/recipes";
import {
  findStandardCatalogueMeal,
  findStandardCatalogueMealBySlug,
  standardCatalogue,
} from "../../src/lib/domain/standard-catalogue";

const validRecipe = {
  title: "Tomato pasta",
  description: "A useful weeknight dinner.",
  ingredients: [
    {
      id: "ingredient-1",
      name: "chopped tomatoes",
      quantity: "1 × 400g",
      unit: "tin",
      note: "drained",
    },
  ],
  steps: [{ id: "step-1", text: "Simmer until reduced." }],
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 20,
  proteinCategory: "meat-free" as const,
};

test("preserves authored ingredient quantity text while normalising whitespace", () => {
  const prepared = prepareRecipeContent({
    ...validRecipe,
    title: "  Tomato pasta  ",
    ingredients: [
      {
        id: "ingredient-1",
        name: "  chopped tomatoes  ",
        quantity: "  1 × 400g  ",
        unit: "  tin  ",
        note: "  drained  ",
      },
    ],
  });

  expect(prepared.title).toBe("Tomato pasta");
  expect(prepared.ingredients[0]).toEqual({
    id: "ingredient-1",
    name: "chopped tomatoes",
    quantity: "1 × 400g",
    unit: "tin",
    note: "drained",
  });
});

test("rejects duplicate stable ingredient line IDs", () => {
  expect(() =>
    prepareRecipeContent({
      ...validRecipe,
      ingredients: [
        validRecipe.ingredients[0]!,
        { ...validRecipe.ingredients[0]!, name: "tomato purée" },
      ],
    }),
  ).toThrow(RecipeValidationError);
});

test("requires a valid protein category", () => {
  expect(() =>
    prepareRecipeContent({
      ...validRecipe,
      // @ts-expect-error intentional invalid fixture
      proteinCategory: "duck",
    }),
  ).toThrow(RecipeValidationError);
});

test("rejects catalogue meals that share an ID or slug", () => {
  expect(() =>
    prepareStandardCatalogue({
      version: 1,
      meals: [
        { id: "same-meal", slug: "first-meal", ...validRecipe },
        { id: "same-meal", slug: "second-meal", ...validRecipe },
      ],
    }),
  ).toThrow("Catalogue meal IDs must be unique.");

  expect(() =>
    prepareStandardCatalogue({
      version: 1,
      meals: [
        { id: "meal-1", slug: "same-meal", ...validRecipe },
        { id: "meal-2", slug: "same-meal", ...validRecipe },
      ],
    }),
  ).toThrow("Catalogue meal slugs must be unique.");
});

test("resolves catalogue meals only for the current catalogue version", () => {
  const sample = standardCatalogue.meals[0];
  expect(sample).toBeDefined();
  if (sample === undefined) return;

  expect(
    findStandardCatalogueMeal(sample.id, standardCatalogue.version),
  ).toMatchObject({ id: sample.id, slug: sample.slug });
  expect(
    findStandardCatalogueMeal(sample.id, standardCatalogue.version + 1),
  ).toBeNull();
  expect(findStandardCatalogueMealBySlug("missing-meal")).toBeNull();
});
