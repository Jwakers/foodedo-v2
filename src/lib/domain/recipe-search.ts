type RecipeSearchable = {
  title: string;
  description?: string;
};

/**
 * Deliberately lightweight MVP search: a trimmed, case-insensitive substring
 * match across the recipe copy already available in catalogue listings.
 */
export function filterCatalogueMealsBySearch<T extends RecipeSearchable>(
  meals: ReadonlyArray<T>,
  query: string,
) {
  const normalisedQuery = query.trim().toLowerCase();

  if (!normalisedQuery) return meals;

  return meals.filter((meal) =>
    [meal.title, meal.description]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalisedQuery)),
  );
}
