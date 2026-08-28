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
      ingredients: [
        {
          id: "tomatoes",
          name: "Chopped tomatoes",
          quantity: "2",
          unit: "tins",
        },
      ],
    },
    {
      recipeId: "curry",
      title: "Chickpea curry",
      ingredients: [
        {
          id: "tomatoes",
          name: "  chopped   tomatoes ",
          quantity: "1",
          unit: "tin",
        },
      ],
    },
  ]);

  expect(items).toEqual([
    {
      name: "Chopped tomatoes",
      detailLines: ["2 tins · Tomato pasta", "1 tin · Chickpea curry"],
      sourceRecipeIds: ["pasta", "curry"],
    },
  ]);
});

test("keeps meaningfully different ingredient names separate", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "one",
      title: "First recipe",
      ingredients: [
        { id: "garlic", name: "garlic", quantity: "2", unit: "cloves" },
        { id: "bulb", name: "garlic bulb", quantity: "1" },
      ],
    },
  ]);

  expect(items.map((item) => item.name)).toEqual(["garlic", "garlic bulb"]);
});

test("trims manual items and rejects empty input", () => {
  expect(prepareManualShoppingItemName("  oat   milk ")).toBe("oat milk");
  expect(() => prepareManualShoppingItemName("   ")).toThrow(
    ShoppingListValidationError,
  );
});
