import { formatRecipeHeading } from "./recipe-headings";

type RecipeSearchable = {
  title: string;
  description?: string;
};

/**
 * Deliberately lightweight MVP search: a trimmed, case-insensitive substring
 * match across the recipe copy already available in catalogue listings.
 * Search the displayed heading words without rewriting the stored recipe.
 */
export function filterCatalogueMealsBySearch<T extends RecipeSearchable>(
  meals: ReadonlyArray<T>,
  query: string,
) {
  const normalisedQuery = formatRecipeHeading(query).trim().toLowerCase();

  if (!normalisedQuery) return meals;

  return meals.filter((meal) =>
    [meal.title, meal.description]
      .filter((value): value is string => Boolean(value))
      .some((value) =>
        formatRecipeHeading(value).toLowerCase().includes(normalisedQuery),
      ),
  );
}
