import type { CatalogueMealSummary } from "./recipes";
import { sortRecipes, type RecipeSort } from "./recipe-filtering";

export const recipeDirectoryPageSize = 20;

/** Public HTML seeds have no relationship to the live query's opaque cursors. */
export type RecipeDirectorySeed = {
  page: CatalogueMealSummary[];
  isDone: boolean;
};

export function recipeDirectoryPath(page: number) {
  return page === 1 ? "/recipes" : `/recipes?page=${page}`;
}

export function recipeDirectoryPage(
  meals: readonly CatalogueMealSummary[],
  pageNumber: number,
  sort: RecipeSort = "recommended",
) {
  const totalPages = Math.max(
    1,
    Math.ceil(meals.length / recipeDirectoryPageSize),
  );
  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > totalPages
  )
    return null;
  const ordered = sortRecipes(
    [...meals].sort((a, b) => b.position - a.position),
    sort,
  );
  return {
    page: ordered.slice(
      (pageNumber - 1) * recipeDirectoryPageSize,
      pageNumber * recipeDirectoryPageSize,
    ),
    isDone: pageNumber === totalPages,
    pageNumber,
    totalPages,
  };
}
