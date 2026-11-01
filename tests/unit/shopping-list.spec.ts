import { expect, test } from "@playwright/test";
import {
  classifyShoppingIngredient,
  deriveShoppingListItems,
  prepareManualShoppingItemName,
  ShoppingListValidationError,
  shoppingItemIdentityKey,
} from "../../src/lib/domain/shopping-list";

for (const names of [
  ["eggs", "egg"],
  ["egg", "eggs"],
]) {
  test(`combines 4 ${names[0]} and 2 ${names[1]} with recipe quantities intact`, () => {
    const items = deriveShoppingListItems(
      names.map((name, index) => ({
        recipeId: `recipe-${index}`,
        title: `Recipe ${index}`,
        ingredients: [
          {
            id: "eggs",
            name,
            shoppingCategory: "dairy_and_eggs" as const,
            quantity: index === 0 ? "4" : "2",
          },
        ],
      })),
    );
    expect(items).toHaveLength(1);
    expect(items[0].displayName).toBe("6 eggs");
    expect(items[0].sources.map((source) => source.amount)).toEqual(["4", "2"]);
    expect(items[0].sourceRecipeIds).toEqual(["recipe-0", "recipe-1"]);
    expect(items[0].detailLines).toEqual(["4 · Recipe 0", "2 · Recipe 1"]);
  });
}

test("egg matching preserves qualifiers and category boundaries", () => {
  const key = shoppingItemIdentityKey("egg", "dairy_and_eggs");
  expect(shoppingItemIdentityKey(" EGGS ", "dairy_and_eggs")).toBe(key);
  for (const name of ["egg whites", "egg yolks", "duck eggs", "large eggs"]) {
    expect(shoppingItemIdentityKey(name, "dairy_and_eggs")).not.toBe(key);
  }
  expect(shoppingItemIdentityKey("eggs", "other")).not.toBe(key);
});

test("egg grouping leaves incompatible quantities visible without adding them", () => {
  const [item] = deriveShoppingListItems([
    {
      recipeId: "one",
      title: "One",
      ingredients: [
        {
          id: "whole",
          name: "eggs",
          shoppingCategory: "dairy_and_eggs",
          quantity: "4",
        },
        {
          id: "weight",
          name: "egg",
          shoppingCategory: "dairy_and_eggs",
          quantity: "100",
          unit: "g",
        },
      ],
    },
  ]);
  expect(item.displayName).toBe("eggs");
  expect(item.sources.map((source) => source.amount)).toEqual(["4", "100 g"]);
});

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

test("uses the mapped plural for compatible whole-item amounts", () => {
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

test("keeps garlic singular when combining whole amounts", () => {
  const [garlic] = deriveShoppingListItems([
    {
      recipeId: "one",
      title: "One",
      ingredients: [
        {
          id: "garlic-1",
          name: "garlic",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "whole",
        },
      ],
    },
    {
      recipeId: "two",
      title: "Two",
      ingredients: [
        {
          id: "garlic-2",
          name: "garlic",
          shoppingCategory: "fruit_and_veg",
          quantity: "1",
          unit: "whole",
        },
      ],
    },
  ]);

  expect(garlic?.displayName).toBe("2 garlic");
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

test("ingredient details use a comma before preparation notes", () => {
  const items = deriveShoppingListItems([
    {
      recipeId: "dinner",
      title: "Dinner",
      date: "2030-01-01",
      ingredients: [
        {
          id: "onions",
          name: "onion",
          shoppingCategory: "fruit_and_veg",
          quantity: "3",
          note: "finely chopped",
        },
      ],
    },
  ]);
  expect(items[0].detailLines).toEqual(["3, finely chopped · Dinner"]);
});

for (const [first, second, display] of [
  ["onion", "brown onions", "3 onions"],
  ["brown onion", "onions", "3 onions"],
  ["yellow onion", "brown onions", "3 onions"],
  ["tomato", "tomatoes", "3 tomatoes"],
  ["potatoes", "potato", "3 potatoes"],
  ["zucchini", "courgettes", "3 courgettes"],
  ["eggplants", "aubergine", "3 aubergines"],
  ["scallions", "spring onion", "3 spring onions"],
  ["garbanzo beans", "chickpea", "3 chickpeas"],
  ["chili", "chillies", "3 chillies"],
]) {
  test(`groups ${first} with ${second} and uses a consistent display name`, () => {
    for (const names of [
      [first, second],
      [second, first],
    ]) {
      const items = deriveShoppingListItems(
        names.map((name, index) => ({
          recipeId: `recipe-${index}`,
          title: `Recipe ${index}`,
          ingredients: [
            {
              id: "line",
              name,
              quantity: index === 0 ? "1" : "2",
              shoppingCategory: "other" as const,
            },
          ],
        })),
      );
      expect(items).toHaveLength(1);
      expect(items[0].displayName).toBe(display);
      expect(items[0].sources.map((source) => source.amount)).toEqual([
        "1",
        "2",
      ]);
    }
  });
}

test("synonyms preserve fresh, dried, colour, preparation and product distinctions", () => {
  for (const [first, second] of [
    ["tomato", "chopped tomatoes"],
    ["tomato", "tinned tomatoes"],
    ["onion", "red onion"],
    ["brown onion", "white onion"],
    ["brown onion", "shallot"],
    ["brown onion", "spring onion"],
    ["brown onion", "large brown onions"],
    ["brown onion", "onion powder"],
    ["red pepper", "green pepper"],
    ["fresh coriander", "ground coriander"],
    ["cilantro", "coriander seeds"],
    ["chickpeas", "tinned chickpeas"],
    ["chilli", "chilli powder"],
    ["baking soda", "baking powder"],
    ["lemon", "lemon juice"],
    ["garlic", "garlic cloves"],
    ["egg", "large eggs"],
  ]) {
    expect(shoppingItemIdentityKey(first, "other")).not.toBe(
      shoppingItemIdentityKey(second, "other"),
    );
  }
  expect(shoppingItemIdentityKey("SCALLIONS", "other")).not.toBe(
    shoppingItemIdentityKey("spring onion", "fruit_and_veg"),
  );
});

test("mass-ingredient synonyms combine compatible weights without changing source notes", () => {
  const [item] = deriveShoppingListItems([
    {
      recipeId: "one",
      title: "One",
      ingredients: [
        {
          id: "one",
          name: "cilantro",
          quantity: "10",
          unit: "g",
          note: "chopped",
          shoppingCategory: "fruit_and_veg",
        },
        {
          id: "two",
          name: "fresh coriander",
          quantity: "15",
          unit: "g",
          shoppingCategory: "fruit_and_veg",
        },
      ],
    },
  ]);
  expect(item.displayName).toBe("25 g fresh coriander");
  expect(item.detailLines).toEqual(["10 g, chopped · One", "15 g · One"]);
});

test("mapped plurals use singular display for one whole item and leave unknown names alone", () => {
  for (const [name, expected] of [
    ["tomatoes", "1 tomato"],
    ["scallions", "1 spring onion"],
    ["special apples", "1 special apples"],
  ]) {
    const [item] = deriveShoppingListItems([
      {
        recipeId: "one",
        title: "One",
        ingredients: [
          { id: "one", name, quantity: "1", shoppingCategory: "other" },
        ],
      },
    ]);
    expect(item.displayName).toBe(expected);
  }
});
