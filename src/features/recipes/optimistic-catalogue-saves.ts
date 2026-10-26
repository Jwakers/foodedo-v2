import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Convex owns rebasing and rollback; all heart controls share this query. */
export function optimisticallySetCatalogueSaved(
  store: OptimisticLocalStore,
  {
    catalogueMealId,
    saved,
  }: FunctionArgs<typeof api.recipes.setCatalogueMealSaved>,
) {
  const current = store.getQuery(api.recipes.listSavedCatalogueMeals, {});
  if (current === undefined) return;
  const withoutMeal = current.filter(
    (recipe) => recipe.catalogueMealId !== catalogueMealId,
  );
  store.setQuery(
    api.recipes.listSavedCatalogueMeals,
    {},
    saved
      ? [
          ...withoutMeal,
          current.find(
            (recipe) => recipe.catalogueMealId === catalogueMealId,
          ) ?? {
            catalogueMealId,
            // Membership only: this temporary ID is never routed to or sent to a
            // mutation. Desired-state writes address the real catalogue identity.
            recipeId: `optimistic:${catalogueMealId}` as Id<"recipes">,
          },
        ]
      : withoutMeal,
  );
}
