import { expect, test } from "@playwright/test";

import {
  formatIngredientAmount,
  formatIngredientName,
} from "../../src/lib/domain/recipe-display";

test("formats ingredient amount and name for recipe detail rows", () => {
  expect(
    formatIngredientAmount({
      id: "1",
      name: "olive oil",
      shoppingCategory: "pantry",
      quantity: "2",
      unit: "tbsp",
    }),
  ).toBe("2 tbsp");
  expect(
    formatIngredientAmount({
      id: "2",
      name: "salt",
      shoppingCategory: "pantry",
    }),
  ).toBe("—");
  expect(
    formatIngredientName({
      id: "3",
      name: "chicken thighs",
      shoppingCategory: "meat_and_fish",
      note: "skinless",
    }),
  ).toBe("chicken thighs, skinless");
  expect(
    formatIngredientName({
      id: "4",
      name: "olive oil",
      shoppingCategory: "pantry",
    }),
  ).toBe("olive oil");
});
