import { expect, test } from "@playwright/test";
import {
  classifyShoppingIngredient,
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
      treatment: "required",
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

test("omits generic preparation water but keeps specific water products", () => {
  expect(classifyShoppingIngredient("water")).toBe("omit");
  expect(classifyShoppingIngredient(" Boiling   water ")).toBe("omit");
  expect(classifyShoppingIngredient("tap water")).toBe("omit");
  expect(classifyShoppingIngredient("sparkling water")).toBe("required");
  expect(classifyShoppingIngredient("bottled water")).toBe("required");
  expect(classifyShoppingIngredient("filtered water")).toBe("required");
});

test("marks only the narrow approved household staples", () => {
  expect(classifyShoppingIngredient("fine sea salt")).toBe("staple");
  expect(classifyShoppingIngredient("black peppercorns")).toBe("staple");
  expect(classifyShoppingIngredient("extra virgin olive oil")).toBe("staple");
  expect(classifyShoppingIngredient("neutral cooking oil")).toBe("staple");
  expect(classifyShoppingIngredient("sesame oil")).toBe("required");
  expect(classifyShoppingIngredient("plain flour")).toBe("required");
  expect(classifyShoppingIngredient("butter")).toBe("required");
});

test("omits water and labels staples while deriving recipe items", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "recipe",
      title: "Soup",
      ingredients: [
        {
          id: "water",
          name: "boiling water",
          shoppingCategory: "other",
          quantity: "500",
          unit: "ml",
        },
        {
          id: "oil",
          name: "vegetable oil",
          shoppingCategory: "pantry",
          quantity: "1",
          unit: "tbsp",
        },
      ],
    },
  ]);

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    name: "vegetable oil",
    treatment: "staple",
  });
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
