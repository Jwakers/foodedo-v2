import { recipeServingScaling } from "../../../src/lib/domain/ingredient-scaling";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getActivePlanState, getPlanSlots } from "../activePlan";
import { getCatalogueMeal } from "../catalogue";
import { type SpaceId } from "../spaces";
import { defaultPlanServings } from "./model";

export async function buildMealPlanView(
  ctx: QueryCtx,
  ownerId: SpaceId,
  mealPlan: Doc<"mealPlans">,
  { hasActivePlanConflict }: { hasActivePlanConflict: boolean },
) {
  const mealSlots = await getPlanSlots(ctx, mealPlan._id);
  const recipes = await Promise.all(
    mealSlots.map(async (mealSlot) => {
      return await ctx.db.get(mealSlot.recipeId);
    }),
  );
  const mealSlotViews = await Promise.all(
    mealSlots.map(async (mealSlot, index) => {
      const recipe = recipes[index] ?? null;
      if (recipe === null || recipe.ownerId !== ownerId) {
        return {
          _id: mealSlot._id,
          date: mealSlot.date,
          recipeId: mealSlot.recipeId,
          isAvailable: false,
          catalogueMealId: null,
          catalogueVersion: null,
          catalogueMealSlug: null,
          title: "Recipe unavailable",
          description: null,
          imageSrc: null,
          prepMinutes: null,
          cookMinutes: null,
          status: mealSlot.status,
        };
      }

      const catalogueMeal =
        recipe.source.type === "catalogue"
          ? await getCatalogueMeal(
              ctx,
              recipe.source.catalogueMealId,
              recipe.source.catalogueVersion,
            )
          : null;

      return {
        _id: mealSlot._id,
        date: mealSlot.date,
        recipeId: recipe._id,
        isAvailable: true,
        catalogueMealId:
          recipe.source.type === "catalogue"
            ? recipe.source.catalogueMealId
            : null,
        catalogueVersion:
          recipe.source.type === "catalogue"
            ? recipe.source.catalogueVersion
            : null,
        catalogueMealSlug: catalogueMeal?.slug ?? null,
        title: recipe.title,
        description: recipe.description ?? catalogueMeal?.description ?? null,
        imageSrc:
          recipe.imageStorageId === undefined
            ? null
            : await ctx.storage.getUrl(recipe.imageStorageId),
        servings: recipe.servings,
        minimumServings: recipe.minimumServings,
        servingScaling: recipeServingScaling(recipe),
        prepMinutes: recipe.prepMinutes ?? null,
        cookMinutes: recipe.cookMinutes ?? null,
        status: mealSlot.status,
      };
    }),
  );

  return {
    _id: mealPlan._id,
    startDate: mealPlan.startDate,
    endDate: mealPlan.endDate,
    servings: mealPlan.servings ?? defaultPlanServings,
    updatedAt: mealPlan.updatedAt,
    status: mealPlan.status,
    hasActivePlanConflict,
    mealSlots: mealSlotViews,
  };
}

export async function getSingleActivePlan(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
): Promise<Doc<"mealPlans"> | null> {
  const state = await getActivePlanState(ctx, ownerId);
  if (state.hasConflict) {
    throw new Error("Resolve multiple active meal plans before continuing.");
  }
  return state.mealPlan;
}

export async function resolveExpectedActivePlan(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
  expected: {
    mealPlanId: Id<"mealPlans">;
    expectedUpdatedAt: number;
  },
) {
  const state = await getActivePlanState(ctx, ownerId);
  if (state.hasConflict) {
    return { status: "plan_unavailable" as const };
  }
  if (state.mealPlan === null) {
    return { status: "no_active_plan" as const };
  }
  if (
    state.mealPlan._id !== expected.mealPlanId ||
    state.mealPlan.updatedAt !== expected.expectedUpdatedAt
  ) {
    return { status: "plan_changed" as const };
  }
  return { status: "ready" as const, mealPlan: state.mealPlan };
}

export async function resolvePlanRecipes(
  ctx: QueryCtx | MutationCtx,
  mealSlots: Array<Doc<"mealSlots">>,
  ownerId: SpaceId,
) {
  const recipesBySlot = new Map<Id<"mealSlots">, Doc<"recipes">>();
  for (const mealSlot of mealSlots) {
    const recipe = await ctx.db.get(mealSlot.recipeId);
    if (recipe?.ownerId === ownerId) {
      recipesBySlot.set(mealSlot._id, recipe);
    }
  }
  return recipesBySlot;
}
