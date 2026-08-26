import { expect, test } from "@playwright/test";
import {
  prepareRecipeContent,
  prepareStandardCatalogue,
  RecipeValidationError,
} from "../../src/lib/domain/recipes";

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
      meals: [{ id: "tomato-pasta", ...validRecipe }],
    }),
  ).toMatchObject({
    version: 1,
    meals: [{ id: "tomato-pasta", title: "Tomato pasta" }],
  });

  expect(() =>
    prepareStandardCatalogue({
      version: 1,
      meals: [
        { id: "same-meal", ...validRecipe },
        { id: "same-meal", ...validRecipe },
      ],
    }),
  ).toThrow("Catalogue meal IDs must be unique.");
});
