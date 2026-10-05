// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  allocateSlugs,
  formatAmount,
  inferCostBand,
  inferPreheat,
  inferTimerCues,
  mapProtein,
  mapShoppingCategory,
  stableHash,
  transformRecipe,
  validateCandidateSet,
  type V1SystemRecipe,
} from "./transform";

const baseRecipe: V1SystemRecipe = {
  _id: "v1-recipe",
  _creationTime: 1,
  title: "Traybake & Beans",
  description: "A useful dinner.",
  image: "https://example.com/image.webp",
  prepTime: 10,
  cookTime: 30,
  serves: 4,
  source: "system",
  primaryProtein: "vegan",
  ingredients: [
    {
      ingredientId: "ingredient-1",
      name: "beans",
      amount: 2,
      unit: "can",
      preparation: "drained",
    },
  ],
  method: [
    {
      title: "Bake",
      description: "Preheat the oven to 200°C, then bake for 20-25 minutes.",
    },
  ],
};

describe("catalogue migration transforms", () => {
  test("allocates stable collision-safe slugs", () => {
    const slugs = allocateSlugs([
      baseRecipe,
      { ...baseRecipe, _id: "another", title: "Traybake and Beans" },
    ]);
    expect(slugs.get("another")).toBe("traybake-and-beans");
    expect(slugs.get("v1-recipe")).toMatch(/^traybake-and-beans-[a-f0-9]{8}$/);
    expect(allocateSlugs([baseRecipe]).get("v1-recipe")).toBe(
      "traybake-and-beans",
    );
  });

  test.each([
    ["turkey", "chicken"],
    ["seafood", "fish"],
    ["vegetarian", "meat-free"],
    ["duck", "other"],
    ["venison", "other"],
    [undefined, "other"],
  ])("maps protein %s to %s", (source, expected) => {
    expect(mapProtein(source)).toBe(expected);
  });

  test("maps ingredient taxonomy conservatively", () => {
    expect(mapShoppingCategory({ _id: "1", foodGroup: "Vegetables" })).toBe(
      "fruit_and_veg",
    );
    expect(
      mapShoppingCategory({
        _id: "2",
        foodGroup: "Cereals and cereal products",
        foodSubGroup: "Bread products",
      }),
    ).toBe("bakery");
    expect(mapShoppingCategory({ _id: "3", foodGroup: "Animal foods" })).toBe(
      "meat_and_fish",
    );
    expect(mapShoppingCategory(undefined)).toBe("other");
  });

  test.each([
    ["yellow onion", "fruit_and_veg"],
    ["pork loin steaks", "meat_and_fish"],
    ["plain yoghurt", "dairy_and_eggs"],
    ["vegetable oil", "pantry"],
    ["black pepper", "pantry"],
    ["coconut milk", "pantry"],
    ["fresh coriander", "fruit_and_veg"],
    ["flour tortillas", "bakery"],
    ["black peppercorns", "pantry"],
    ["oven-ready lasagna sheets", "pantry"],
    ["sourdough loaf", "bakery"],
    ["boiling water", "other"],
  ])("uses a decisive ingredient name for %s", (name, expected) => {
    expect(
      mapShoppingCategory(
        { _id: "legacy", foodGroup: "Herbs and spices" },
        name,
      ),
    ).toBe(expected);
  });

  test("preserves zero amounts and rejects non-finite values", () => {
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(formatAmount(Number.NaN)).toBeUndefined();
    expect(formatAmount(null)).toBeUndefined();
  });

  test("extracts explicit preheat and upper-bound timer evidence", () => {
    expect(inferPreheat(baseRecipe.method!)).toMatchObject({
      value: { appliance: "oven", temperatureC: 200 },
      requiresApproval: true,
    });
    const result = inferTimerCues(baseRecipe._id, baseRecipe.method!);
    expect(result.steps[0]?.timerCues?.[0]).toMatchObject({
      label: "Bake",
      durationSeconds: 25 * 60,
    });
    expect(result.evidence?.evidence[0]).toContain("20-25 minutes");
  });

  test("uses the documented UK relative-cost rubric", () => {
    expect(inferCostBand(baseRecipe).value).toBe("budget");
    expect(
      inferCostBand({
        ...baseRecipe,
        title: "Salmon supper",
        primaryProtein: "fish",
      }).value,
    ).toBe("premium");
    expect(
      inferCostBand({
        ...baseRecipe,
        title: "Chicken dinner",
        primaryProtein: "chicken",
      }).value,
    ).toBe("standard");
  });

  test("creates a faithful candidate with deterministic IDs and flags", () => {
    const candidate = transformRecipe({
      recipe: baseRecipe,
      slug: "traybake-and-beans",
      seedRecipeKeys: new Set(),
      ingredientMetadata: new Map([
        ["ingredient-1", { _id: "ingredient-1", foodGroup: "Pulses" }],
      ]),
      imageFile: "images/traybake-and-beans.webp",
      imageSha256: stableHash("image"),
    });
    expect(candidate.flags).toEqual([
      "absent_from_v1_seed",
      "missing_v1_public_slug",
    ]);
    expect(candidate.meal).toMatchObject({
      id: "traybake-and-beans",
      version: 1,
      proteinCategory: "meat-free",
      costBand: "budget",
      servingScaling: "safe",
      ingredients: [
        {
          name: "beans",
          shoppingCategory: "pantry",
          quantity: "2",
          unit: "can",
          note: "drained",
        },
      ],
    });
    expect(candidate.meal.steps[0]?.text).toBe(
      "Bake: Preheat the oven to 200°C, then bake for 20-25 minutes.",
    );
    expect(validateCandidateSet([candidate])).toEqual([]);
  });

  test("reports duplicate identities and incomplete image metadata", () => {
    const candidate = transformRecipe({
      recipe: baseRecipe,
      slug: "traybake-and-beans",
      seedRecipeKeys: new Set(["traybake-and-beans"]),
      ingredientMetadata: new Map(),
      imageFile: "image.webp",
      imageSha256: "",
    });
    expect(validateCandidateSet([candidate, candidate])).toEqual(
      expect.arrayContaining([
        "Duplicate meal id: traybake-and-beans",
        "Duplicate slug: traybake-and-beans",
        "Duplicate V1 id: v1-recipe",
      ]),
    );
  });
});
