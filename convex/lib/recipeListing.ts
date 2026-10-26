import { v } from "convex/values";
import type { PaginationOptions } from "convex/server";
import { filterRecipes } from "../../src/lib/domain/recipe-filtering";
import { filterCatalogueMealsBySearch } from "../../src/lib/domain/recipe-search";
import type { ProteinCategory, CostBand } from "../../src/lib/domain/recipes";
import { proteinCategoryValidator } from "./recipeValidators";
import { catalogueBrowseKeys } from "./catalogue";

export const listingFilterArgs = {
  searchQuery: v.optional(v.string()),
  under30Minutes: v.optional(v.boolean()),
  budgetFriendly: v.optional(v.boolean()),
  proteinCategories: v.optional(v.array(proteinCategoryValidator)),
  sort: v.optional(
    v.union(
      v.literal("recommended"),
      v.literal("quickest"),
      v.literal("lowest-cost"),
    ),
  ),
};

type ListingFilters = {
  searchQuery?: string;
  under30Minutes?: boolean;
  budgetFriendly?: boolean;
  proteinCategories?: ProteinCategory[];
};

export function matchesRecipeListing(
  recipe: {
    title: string;
    description?: string;
    prepMinutes?: number;
    cookMinutes?: number;
    costBand?: CostBand;
    proteinCategory?: ProteinCategory;
  },
  filters: ListingFilters,
) {
  return (
    filterRecipes(
      [{ ...recipe, proteinCategory: recipe.proteinCategory ?? "meat-free" }],
      {
        under30Minutes: filters.under30Minutes ?? false,
        budgetFriendly: filters.budgetFriendly ?? false,
        proteinCategories: filters.proteinCategories ?? [],
      },
    ).length > 0 &&
    filterCatalogueMealsBySearch([recipe], filters.searchQuery ?? "").length > 0
  );
}

/** Bound sparse-search scans, including reactive page refreshes. */
export function listingPaginationOptions(opts: PaginationOptions) {
  return {
    ...opts,
    numItems: Math.min(Math.max(opts.numItems, 1), 50),
    maximumRowsRead: Math.min(opts.maximumRowsRead ?? 256, 256),
    maximumBytesRead: Math.min(
      opts.maximumBytesRead ?? 4 * 1024 * 1024,
      4 * 1024 * 1024,
    ),
  };
}

/** Descending indexes preserve newest-saved-first ordering within equal ranks. */
export function personalRecipeBrowseKeys(
  recipe: Parameters<typeof catalogueBrowseKeys>[0],
) {
  const keys = catalogueBrowseKeys(recipe);
  return {
    browseDuration: -keys.browseDuration,
    browseCostRank: -keys.browseCostRank,
  };
}
