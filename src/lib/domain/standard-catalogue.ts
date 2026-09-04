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
