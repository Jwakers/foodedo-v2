import {
  addDaysToPlanDate,
  isPlanDays,
} from "../../../src/lib/domain/guest-draft";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { getPlanSlots } from "../activePlan";
import { requireUserId } from "../auth";
import { getOrCreateCatalogueRecipe } from "../catalogueRecipes";
import {
  recipeSelectionKey,
  recordMealSelectionOutcome,
} from "../mealSelection";
import { syncShoppingListForPlan } from "../shoppingListSync";
import { copyRecipeToSpace, type SpaceId } from "../spaces";
import { type PlanRecipeChoice, type PlanRecipeReference } from "./model";
import { throwInvalidPlan } from "./validation";

export async function resolveRecipeReference(
  ctx: MutationCtx,
  ownerId: SpaceId,
  recipeReference: PlanRecipeReference,
) {
  if (recipeReference.type === "existing") {
    const recipe = await ctx.db.get(recipeReference.recipeId);
    if (
      recipe === null ||
      (recipe.ownerId !== ownerId &&
        recipe.ownerId !== (await requireUserId(ctx)))
    ) {
      throw new Error("A selected personal recipe could not be resolved.");
    }
    return await copyRecipeToSpace(ctx, recipe, ownerId);
  }

  const recipe = await getOrCreateCatalogueRecipe(ctx, {
    ownerId,
    catalogueMealId: recipeReference.catalogueMealId,
    catalogueVersion: recipeReference.catalogueVersion,
    saveToLibrary: false,
  });
  return recipe.recipeId;
}

export async function createPlanFromGuestMealChoices(
  ctx: MutationCtx,
  {
    ownerId,
    startDate,
    servings,
    mealChoices,
    createdAt,
  }: {
    ownerId: SpaceId;
    startDate: string;
    servings: number;
    mealChoices: ReadonlyArray<{
      date: string;
      catalogueMealId: string | null;
      catalogueVersion: number | null;
    }>;
    createdAt: number;
  },
) {
  if (!isPlanDays(mealChoices.length)) {
    throw new Error("A meal plan must span between 3 and 7 consecutive days.");
  }

  const plannedChoices = mealChoices.filter(
    (
      choice,
    ): choice is {
      date: string;
      catalogueMealId: string;
      catalogueVersion: number;
    } => choice.catalogueMealId !== null && choice.catalogueVersion !== null,
  );
  if (plannedChoices.length === 0) {
    throwInvalidPlan("Save at least one dinner before keeping this plan.");
  }

  const mealPlanId = await ctx.db.insert("mealPlans", {
    ownerId,
    startDate,
    endDate: addDaysToPlanDate(startDate, mealChoices.length - 1),
    servings,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });

  for (const choice of plannedChoices) {
    const recipeId = await resolveRecipeReference(ctx, ownerId, {
      type: "catalogue",
      catalogueMealId: choice.catalogueMealId,
      catalogueVersion: choice.catalogueVersion,
    });
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerId,
      date: choice.date,
      recipeId,
      status: "planned",
      createdAt,
      updatedAt: createdAt,
    });
  }

  await recordKeptPlanMeals(ctx, ownerId, mealPlanId, createdAt);
  await syncShoppingListForPlan(ctx, ownerId, mealPlanId);

  return mealPlanId;
}

export async function createPlanFromRecipeChoices(
  ctx: MutationCtx,
  {
    ownerId,
    mealChoices,
    startDate,
    endDate,
    servings,
    createdAt,
  }: {
    ownerId: SpaceId;
    mealChoices: readonly PlanRecipeChoice[];
    startDate: string;
    endDate: string;
    servings: number;
    createdAt: number;
  },
) {
  const firstChoice = mealChoices[0];
  const lastChoice = mealChoices.at(-1);
  if (firstChoice === undefined || lastChoice === undefined) {
    throw new Error("A meal plan must contain at least one meal.");
  }

  const mealPlanId = await ctx.db.insert("mealPlans", {
    ownerId,
    startDate,
    endDate,
    servings,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });

  for (const choice of mealChoices) {
    const recipeId = await resolveRecipeReference(ctx, ownerId, choice.recipe);
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerId,
      date: choice.date,
      recipeId,
      status: choice.status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await recordKeptPlanMeals(ctx, ownerId, mealPlanId, createdAt);
  await syncShoppingListForPlan(ctx, ownerId, mealPlanId);

  return mealPlanId;
}

export async function recordKeptPlanMeals(
  ctx: MutationCtx,
  ownerId: SpaceId,
  mealPlanId: Id<"mealPlans">,
  updatedAt: number,
) {
  for (const slot of await getPlanSlots(ctx, mealPlanId)) {
    const recipe = await ctx.db.get(slot.recipeId);
    if (recipe && recipe.ownerId === ownerId)
      await recordMealSelectionOutcome(ctx, {
        ownerId,
        mealPlanId,
        date: slot.date,
        candidateKey: recipeSelectionKey(recipe),
        outcome: "kept",
        updatedAt,
      });
  }
}
