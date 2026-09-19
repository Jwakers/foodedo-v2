"use client";

import { useState } from "react";

import {
  emptyRecipeFilters,
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";

/** Direct, one-tap refinements shown alongside recipe filter triggers. */
export const recipeQuickFilterLabels = [
  "Under 30 min",
  "Meat-free",
  "Budget friendly",
] as const;

export function useRecipeFilters() {
  const [filters, setFilters] = useState<RecipeFilters>(emptyRecipeFilters);
  const [sort, setSort] = useState<RecipeSort>("recommended");

  return {
    filters,
    sort,
    setFilters,
    setSort,
    isQuickFilterActive,
    toggleQuickFilter: (label: RecipeQuickFilterLabel) => {
      setFilters((current) => toggleRecipeQuickFilter(current, label));
    },
  };
}

export type RecipeQuickFilterLabel = (typeof recipeQuickFilterLabels)[number];

export function isQuickFilterActive(
  filters: RecipeFilters,
  label: RecipeQuickFilterLabel,
) {
  return label === "Under 30 min"
    ? filters.under30Minutes
    : label === "Budget friendly"
      ? filters.budgetFriendly
      : filters.proteinCategories.includes("meat-free");
}

export function toggleRecipeQuickFilter(
  filters: RecipeFilters,
  label: RecipeQuickFilterLabel,
): RecipeFilters {
  if (label === "Under 30 min") {
    return { ...filters, under30Minutes: !filters.under30Minutes };
  }

  if (label === "Budget friendly") {
    return { ...filters, budgetFriendly: !filters.budgetFriendly };
  }

  const proteinCategories: RecipeFilters["proteinCategories"] =
    filters.proteinCategories.includes("meat-free")
      ? filters.proteinCategories.filter((category) => category !== "meat-free")
      : [...filters.proteinCategories, "meat-free"];

  return { ...filters, proteinCategories };
}
