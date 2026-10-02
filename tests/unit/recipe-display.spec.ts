import { expect, test } from "@playwright/test";

import {
  formatIngredientAmount,
  formatIngredientName,
  formatIngredientNote,
  formatImportedMetadataNotice,
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
  ).toBe("chicken thighs");
  expect(
    formatIngredientNote({
      id: "3",
      name: "chicken thighs",
      shoppingCategory: "meat_and_fish",
      note: "skinless",
    }),
  ).toBe("skinless");
  expect(
    formatIngredientName({
      id: "4",
      name: "olive oil",
      shoppingCategory: "pantry",
    }),
  ).toBe("olive oil");
  expect(
    formatIngredientNote({
      id: "4",
      name: "olive oil",
      shoppingCategory: "pantry",
    }),
  ).toBeUndefined();
});

test("keeps imported ingredient source text out of the amount column", () => {
  expect(
    formatIngredientAmount({
      id: "onion",
      name: "yellow onion",
      note: "peeled and finely diced",
      amountText: "1 medium yellow onion, peeled and finely diced",
      shoppingCategory: "fruit_and_veg",
    }),
  ).toBe("1");
  expect(
    formatIngredientAmount({
      id: "pepper",
      name: "green bell pepper",
      note: "seeded and diced small",
      amountText: "1 medium to large green bell pepper, seeded and diced small",
      shoppingCategory: "fruit_and_veg",
    }),
  ).toBe("1");
  expect(
    formatIngredientAmount({
      id: "garlic",
      name: "garlic",
      note: "finely minced",
      amountText: "3 to 4 cloves garlic, finely minced",
      shoppingCategory: "fruit_and_veg",
    }),
  ).toBe("3 to 4");
  expect(
    formatIngredientAmount({
      id: "butter",
      name: "unsalted butter",
      amountText: "20g / 1½ tbsp",
      shoppingCategory: "dairy_and_eggs",
    }),
  ).toBe("20g / 1½ tbsp");
});

test("explains inferred import metadata without labelling published values", () => {
  expect(
    formatImportedMetadataNotice({
      type: "import",
      method: "url",
      importedAt: 1,
      metadataProvenance: {
        servings: "estimated",
        prepMinutes: "estimated",
        cookMinutes: "derived",
      },
    }),
  ).toBe(
    "Cook time inferred from the recipe. Servings and prep time estimated from the recipe.",
  );
  expect(
    formatImportedMetadataNotice({
      type: "import",
      method: "url",
      importedAt: 1,
      metadataProvenance: {
        servings: "published",
        prepMinutes: "published",
        cookMinutes: "published",
      },
    }),
  ).toBeUndefined();
});
