import { expect, test } from "@playwright/test";
import {
  deriveShoppingListItems,
  prepareManualShoppingItemName,
  ShoppingListValidationError,
} from "../../src/lib/domain/shopping-list";

test("groups only matching ingredient names and preserves each source amount", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "pasta",
      title: "Tomato pasta",
      date: "2026-09-19",
      ingredients: [
        {
          id: "tomatoes",
          name: "Chopped tomatoes",
          shoppingCategory: "pantry",
          quantity: "2",
          unit: "tins",
        },
      ],
    },
    {
      recipeId: "curry",
      title: "Chickpea curry",
      date: "2026-09-20",
      ingredients: [
        {
          id: "tomatoes",
          name: "  chopped   tomatoes ",
          shoppingCategory: "pantry",
          quantity: "1",
          unit: "tin",
        },
      ],
    },
  ]);

  expect(items).toEqual([
    {
      name: "Chopped tomatoes",
      displayName: "3 tins Chopped tomatoes",
      category: "pantry",
      detailLines: ["2 tins · Tomato pasta", "1 tin · Chickpea curry"],
      sourceRecipeIds: ["pasta", "curry"],
      sources: [
        {
          recipeId: "pasta",
          recipeTitle: "Tomato pasta",
          date: "2026-09-19",
          amount: "2 tins",
        },
        {
          recipeId: "curry",
          recipeTitle: "Chickpea curry",
          date: "2026-09-20",
          amount: "1 tin",
        },
      ],
    },
  ]);
});

test("combines compatible amounts into a supermarket-friendly label", () => {
  const [lemons] = deriveShoppingListItems([
    {
      recipeId: "chicken",
      title: "Lemon chicken",
      ingredients: [
        {
          id: "lemon",
          name: "lemon",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "whole",
        },
      ],
    },
    {
      recipeId: "fish",
      title: "Grilled fish",
      ingredients: [
        {
          id: "lemon",
          name: "lemon",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "whole",
        },
      ],
    },
  ]);

  expect(lemons?.displayName).toBe("2 lemons");
});

test("uses the shopping category authored on each ingredient", () => {
  const [item] = deriveShoppingListItems([
    {
      recipeId: "recipe",
      title: "A recipe",
      ingredients: [
        {
          id: "new-ingredient",
          name: "a newly introduced ingredient",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "whole",
        },
      ],
    },
  ]);

  expect(item?.category).toBe("fruit_and_veg");
});

test("keeps meaningfully different ingredient names separate", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "one",
      title: "First recipe",
      ingredients: [
        {
          id: "garlic",
          name: "garlic",
          shoppingCategory: "fruit_and_veg",
          quantity: "2",
          unit: "cloves",
        },
        {
          id: "bulb",
          name: "garlic bulb",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
        },
      ],
    },
  ]);

  expect(items.map((item) => item.name)).toEqual(["garlic", "garlic bulb"]);
});

test("keeps the same ingredient name in different shopping categories separate", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "fresh",
      title: "Fresh salsa",
      ingredients: [
        {
          id: "fresh-coriander",
          name: "coriander",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "bunch",
        },
      ],
    },
    {
      recipeId: "spice",
      title: "Spice mix",
      ingredients: [
        {
          id: "ground-coriander",
          name: "coriander",
          shoppingCategory: "pantry",
          quantity: "1",
          unit: "tsp",
        },
      ],
    },
  ]);

  expect(items).toHaveLength(2);
  expect(items.map((item) => item.category).sort()).toEqual([
    "fruit_and_veg",
    "pantry",
  ]);
});

test("trims manual items and rejects empty input", () => {
  expect(prepareManualShoppingItemName("  oat   milk ")).toBe("oat milk");
  expect(() => prepareManualShoppingItemName("   ")).toThrow(
    ShoppingListValidationError,
  );
});
