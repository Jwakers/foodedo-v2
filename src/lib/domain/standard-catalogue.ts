import {
  prepareStandardCatalogue,
  type CatalogueMeal,
  type StandardCatalogue,
} from "./recipes";
import catalogueData from "./standard-catalogue-data.json";

export const standardCatalogue = prepareStandardCatalogue(
  catalogueData as StandardCatalogue,
);

export function findStandardCatalogueMeal(
  catalogueMealId: string,
  catalogueVersion: number,
): CatalogueMeal | null {
  if (catalogueVersion !== standardCatalogue.version) return null;

  return (
    standardCatalogue.meals.find((meal) => meal.id === catalogueMealId) ?? null
  );
}

export function findStandardCatalogueMealBySlug(
  slug: string,
): CatalogueMeal | null {
  return standardCatalogue.meals.find((meal) => meal.slug === slug) ?? null;
}

/** How many catalogue meals the guest Home "Ideas for your week" carousel shows. */
export const DASHBOARD_WEEK_IDEA_COUNT = 6;

/**
 * Temporary Home inspiration selection: the first N catalogue meals in bundle
 * order. Replace with preference-, history-, and context-aware ranking after
 * MVP — see recipes-and-ingredients.md.
 */
export function selectDashboardWeekIdeas(
  count: number = DASHBOARD_WEEK_IDEA_COUNT,
): CatalogueMeal[] {
  return standardCatalogue.meals.slice(0, count);
}
