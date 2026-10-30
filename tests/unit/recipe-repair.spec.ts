import { expect, test } from "@playwright/test";
import {
  buildRecipeRepairPatch,
  recipeRepairValuesComplete,
} from "@/lib/domain/recipe-repair";

test("repair requires servings and at least one known time without inventing the other", () => {
  const issues = ["servings", "prep_minutes", "cook_minutes"] as const;
  const values = { servings: " 4 ", cook_minutes: "0" };
  expect(recipeRepairValuesComplete([...issues], values)).toBe(true);
  expect(buildRecipeRepairPatch([...issues], values)).toEqual({
    servings: 4,
    cookMinutes: 0,
  });
  expect(buildRecipeRepairPatch([...issues], { servings: "4" })).toBeNull();
});

test("repair rejects missing, fractional, negative and excessive amounts", () => {
  for (const servings of ["", "0", "-1", "1.5", "10081", "unknown"]) {
    expect(recipeRepairValuesComplete(["servings"], { servings })).toBe(false);
    expect(buildRecipeRepairPatch(["servings"], { servings })).toBeNull();
  }
  expect(
    buildRecipeRepairPatch(["cook_minutes"], { cook_minutes: "-1" }),
  ).toBeNull();
});
