import { expect, test } from "@playwright/test";

import {
  emptyRecipeFilters,
  filterRecipes,
  sortRecipes,
} from "../../src/lib/domain/recipe-filtering";
import type {
  CatalogueMealSummary,
  ProteinCategory,
} from "../../src/lib/domain/recipes";

const meals: CatalogueMealSummary[] = [
  {
    id: "quick-budget-chicken",
    version: 1,
    slug: "quick-budget-chicken",
    position: 0,
    title: "Quick budget chicken",
    prepMinutes: 10,
    cookMinutes: 20,
    proteinCategory: "chicken",
    costBand: "budget",
  },
  {
    id: "thirty-one-minute-fish",
    version: 1,
    slug: "thirty-one-minute-fish",
    position: 1,
    title: "Thirty-one minute fish",
    prepMinutes: 1,
    cookMinutes: 30,
    proteinCategory: "fish",
    costBand: "budget",
  },
  {
    id: "unknown-time-beef",
    version: 1,
    slug: "unknown-time-beef",
    position: 2,
    title: "Unknown time beef",
    prepMinutes: 10,
    proteinCategory: "beef",
    costBand: "standard",
  },
  {
    id: "meat-free",
    version: 1,
    slug: "meat-free",
    position: 3,
    title: "Meat-free dinner",
    prepMinutes: 5,
    cookMinutes: 10,
    proteinCategory: "meat-free",
  },
];

test("keeps every recipe when no filters are selected", () => {
  expect(filterRecipes(meals, emptyRecipeFilters)).toBe(meals);
});

test("filters by the approved time metadata", () => {
  expect(
    filterRecipes(meals, {
      ...emptyRecipeFilters,
      under30Minutes: true,
    }).map((meal) => meal.id),
  ).toEqual(["quick-budget-chicken", "meat-free"]);
});

test("combines filter groups and treats selected proteins as alternatives", () => {
  expect(
    filterRecipes(meals, {
      ...emptyRecipeFilters,
      under30Minutes: true,
      proteinCategories: ["chicken", "meat-free"],
    }).map((meal) => meal.id),
  ).toEqual(["quick-budget-chicken", "meat-free"]);
});

test("filters to editorially budget-friendly recipes", () => {
  expect(
    filterRecipes(meals, {
      ...emptyRecipeFilters,
      budgetFriendly: true,
    }).map((meal) => meal.id),
  ).toEqual(["quick-budget-chicken", "thirty-one-minute-fish"]);
});

test("sorts known durations from quickest to slowest and leaves unknown durations last", () => {
  expect(sortRecipes(meals, "quickest").map((meal) => meal.id)).toEqual([
    "meat-free",
    "quick-budget-chicken",
    "thirty-one-minute-fish",
    "unknown-time-beef",
  ]);
  expect(sortRecipes(meals, "recommended")).toBe(meals);
});

test("sorts known cost bands from lowest to highest and leaves unknown cost last", () => {
  expect(sortRecipes(meals, "lowest-cost").map((meal) => meal.id)).toEqual([
    "quick-budget-chicken",
    "thirty-one-minute-fish",
    "unknown-time-beef",
    "meat-free",
  ]);
});

for (const proteinCategory of [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "fish",
  "meat-free",
] as const) {
  test(`filters the ${proteinCategory} category`, () => {
    const otherProtein: ProteinCategory =
      proteinCategory === "fish" ? "chicken" : "fish";
    const recipes = [
      { ...meals[0]!, proteinCategory },
      { ...meals[0]!, id: "other", proteinCategory: otherProtein },
    ];

    expect(
      filterRecipes(recipes, {
        ...emptyRecipeFilters,
        proteinCategories: [proteinCategory],
      }).map((meal) => meal.id),
    ).toEqual(["quick-budget-chicken"]);
  });
}
