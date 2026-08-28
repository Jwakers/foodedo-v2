import { expect, test } from "@playwright/test";
import {
  createRegenerationSelection,
  rotatingMealPlanSelectionStrategy,
  selectReplacementMeal,
} from "../../src/lib/domain/meal-plan-selection";

const mealIds = ["meal-a", "meal-b", "meal-c", "meal-d", "meal-e"];

test("selects a deterministic run of meals and wraps at the catalogue end", () => {
  expect(
    rotatingMealPlanSelectionStrategy({
      candidateMealIds: mealIds,
      numberOfMeals: 4,
      offset: 3,
    }),
  ).toEqual(["meal-d", "meal-e", "meal-a", "meal-b"]);
});

test("replaces a meal without repeating another planned meal when possible", () => {
  expect(
    selectReplacementMeal({
      candidateMealIds: mealIds,
      currentMealId: "meal-b",
      plannedMealIds: ["meal-a", "meal-b", "meal-c"],
    }),
  ).toBe("meal-d");
});

test("preserves elapsed meals while proposing a new remainder", () => {
  expect(
    createRegenerationSelection({
      candidateMealIds: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      currentMealIds: ["a", "b", "c", "d", "e"],
      replaceFromIndex: 2,
      variant: 1,
    }),
  ).toEqual(["a", "b", "g", "h", "i"]);
});
