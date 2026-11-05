import { expect, it } from "vitest";
import { containsFact, verifyRecipe } from "./evaluation";
import type { RecipeContent } from "../../../src/lib/domain/recipes";

it("cannot satisfy a declared numeric fact with a different larger quantity", () => {
  expect(containsFact("1300g lentils", "300g")).toBe(false);
  expect(containsFact("¼ cup oil", "1/4 cup")).toBe(true);
});
it("checks each quantity against its own ingredient and reads method facts only from steps", () => {
  const recipe = {
    ingredients: [
      { name: "carrot", amountText: "200 g" },
      { name: "lentils", amountText: "300 g" },
    ],
    steps: [{ text: "Simmer until tender." }],
    notes: [{ id: "n1", text: "Boil for 40 minutes." }],
  } as RecipeContent;
  const expected = {
    minimumIngredients: 2,
    minimumSteps: 1,
    ingredients: [
      { name: "carrot", amounts: ["300 g"] },
      { name: "lentils", amounts: ["200 g"] },
    ],
    methodFacts: ["40"],
  };
  expect(verifyRecipe(recipe, expected)).toEqual([
    "ingredient:carrot",
    "ingredient:lentils",
    "method:40",
  ]);
});

it("accepts the same canonical quantity when display text adds an authored size qualifier", () => {
  const recipe = {
    ingredients: [
      { name: "cauliflower", quantity: "1", amountText: "1 small head" },
      { name: "chilli oil", quantity: "2", unit: "tsp", amountText: "2 tsp" },
    ],
    steps: [{ text: "Wrap in foil and bake at 180 C." }],
  } as RecipeContent;
  expect(
    verifyRecipe(recipe, {
      minimumIngredients: 2,
      minimumSteps: 1,
      ingredients: [
        { name: "cauliflower", amounts: ["1"] },
        { name: "chili oil", amounts: ["2 tsp"] },
      ],
      methodFacts: ["foil"],
      methodAlternatives: [["350", "180"]],
    }),
  ).toEqual([]);
});
