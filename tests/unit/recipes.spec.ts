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
  title: "  Tomato pasta  ",
  description: "  A useful weeknight dinner.  ",
  ingredients: [
    {
      id: "ingredient-1",
      name: "  chopped tomatoes  ",
      quantity: "  1 × 400g  ",
      unit: "  tin  ",
      note: "  drained  ",
    },
  ],
  steps: [{ id: "step-1", text: "  Simmer until reduced.  " }],
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 20,
};

test("preserves flexible ingredient meaning while normalising whitespace", () => {
  expect(prepareRecipeContent(validRecipe)).toEqual({
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
  });
});

test("removes blank optional text", () => {
  const prepared = prepareRecipeContent({
    ...validRecipe,
    description: "  ",
    ingredients: [{ ...validRecipe.ingredients[0], note: " " }],
  });

  expect(prepared.description).toBeUndefined();
  expect(prepared.ingredients[0]?.note).toBeUndefined();
});

test("rejects duplicate stable line identifiers", () => {
  expect(() =>
    prepareRecipeContent({
      ...validRecipe,
      ingredients: [
        validRecipe.ingredients[0],
        { ...validRecipe.ingredients[0], name: "tomato purée" },
      ],
    }),
  ).toThrow(RecipeValidationError);
});

test("requires at least one ingredient and one step", () => {
  expect(() =>
    prepareRecipeContent({
      ...validRecipe,
      ingredients: [],
    }),
  ).toThrow("Ingredients must contain between 1 and 100 items.");

  expect(() =>
    prepareRecipeContent({
      ...validRecipe,
      steps: [],
    }),
  ).toThrow("Steps must contain between 1 and 100 items.");
});

test("validates versioned catalogue content and stable meal identifiers", () => {
  expect(
    prepareStandardCatalogue({
      version: 1,
      meals: [{ id: "catalogue-meal-1", slug: "tomato-pasta", ...validRecipe }],
    }),
  ).toMatchObject({
    version: 1,
    meals: [
      {
        id: "catalogue-meal-1",
        slug: "tomato-pasta",
        title: "Tomato pasta",
      },
    ],
  });

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

test("exposes only meals from the current standard catalogue version", () => {
  expect(standardCatalogue.meals.length).toBeGreaterThan(0);
  expect(
    findStandardCatalogueMeal("tomato-lentil-pasta", standardCatalogue.version),
  ).toMatchObject({
    id: "tomato-lentil-pasta",
    slug: "tomato-and-lentil-pasta",
    title: "Tomato and lentil pasta",
  });
  expect(
    findStandardCatalogueMealBySlug("tomato-and-lentil-pasta"),
  ).toMatchObject({
    id: "tomato-lentil-pasta",
    title: "Tomato and lentil pasta",
  });
  expect(
    findStandardCatalogueMeal(
      "tomato-lentil-pasta",
      standardCatalogue.version + 1,
    ),
  ).toBeNull();
  expect(
    findStandardCatalogueMeal("missing", standardCatalogue.version),
  ).toBeNull();
  expect(findStandardCatalogueMealBySlug("missing")).toBeNull();
});
