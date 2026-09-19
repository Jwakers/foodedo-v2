import type { CostBand, ProteinCategory } from "@/lib/domain/recipes";

export type RecipeFilters = {
  under30Minutes: boolean;
  budgetFriendly: boolean;
  proteinCategories: ReadonlyArray<ProteinCategory>;
};

type RecipeFilterable = {
  prepMinutes?: number;
  cookMinutes?: number;
  proteinCategory: ProteinCategory;
  costBand?: CostBand;
};

export const recipeSortOptions = [
  "recommended",
  "quickest",
  "lowest-cost",
] as const;
export type RecipeSort = (typeof recipeSortOptions)[number];

export const emptyRecipeFilters: RecipeFilters = {
  under30Minutes: false,
  budgetFriendly: false,
  proteinCategories: [],
};

/**
 * Filters use the small, editorially-authored selection metadata contract.
 * Selected protein categories are alternatives; distinct filter groups combine.
 */
export function filterRecipes<T extends RecipeFilterable>(
  recipes: ReadonlyArray<T>,
  filters: RecipeFilters,
) {
  const hasProteinFilter = filters.proteinCategories.length > 0;

  if (!filters.under30Minutes && !filters.budgetFriendly && !hasProteinFilter) {
    return recipes;
  }

  return recipes.filter((recipe) => {
    if (filters.under30Minutes && !hasMealDurationAtMost(recipe, 30)) {
      return false;
    }

    if (filters.budgetFriendly && recipe.costBand !== "budget") {
      return false;
    }

    return (
      !hasProteinFilter ||
      filters.proteinCategories.includes(recipe.proteinCategory)
    );
  });
}

/** Keeps catalogue order for recommendations and puts recipes with unknown time last. */
export function sortRecipes<T extends RecipeFilterable>(
  recipes: ReadonlyArray<T>,
  sort: RecipeSort,
) {
  if (sort === "recommended") return recipes;

  return [...recipes].sort((left, right) => {
    if (sort === "lowest-cost") {
      return costRank(left.costBand) - costRank(right.costBand);
    }

    const leftDuration = mealDuration(left);
    const rightDuration = mealDuration(right);

    if (leftDuration === null) return rightDuration === null ? 0 : 1;
    if (rightDuration === null) return -1;
    return leftDuration - rightDuration;
  });
}

function costRank(costBand: CostBand | undefined) {
  if (costBand === "budget") return 0;
  if (costBand === "standard") return 1;
  if (costBand === "premium") return 2;
  return 3;
}

function hasMealDurationAtMost(
  recipe: Pick<RecipeFilterable, "prepMinutes" | "cookMinutes">,
  maximumMinutes: number,
) {
  const duration = mealDuration(recipe);
  return duration !== null && duration <= maximumMinutes;
}

function mealDuration(
  recipe: Pick<RecipeFilterable, "prepMinutes" | "cookMinutes">,
) {
  if (recipe.prepMinutes === undefined || recipe.cookMinutes === undefined) {
    return null;
  }

  return recipe.prepMinutes + recipe.cookMinutes;
}
