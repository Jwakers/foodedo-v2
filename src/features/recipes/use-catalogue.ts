"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

export function useCurrentCatalogue() {
  return useQuery(api.catalogue.getCurrent, {});
}

export function useCatalogueMeals(
  meals: ReadonlyArray<{
    catalogueMealId: string;
    catalogueVersion: number;
  }> | null,
) {
  return useQuery(
    api.catalogue.getMeals,
    meals === null ? "skip" : { meals: [...meals] },
  );
}

export function useCurrentCatalogueMeal(slug: string | null) {
  return useQuery(
    api.catalogue.getCurrentMealBySlug,
    slug === null ? "skip" : { slug },
  );
}

export function useCatalogueMeal(
  catalogueMealId: string | null,
  catalogueVersion: number | null,
) {
  return useQuery(
    api.catalogue.getMeal,
    catalogueMealId === null || catalogueVersion === null
      ? "skip"
      : { catalogueMealId, catalogueVersion },
  );
}
