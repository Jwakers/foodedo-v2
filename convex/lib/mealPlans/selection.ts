import {
  minimumServingsNotice,
  recipeServingScaling,
} from "../../../src/lib/domain/ingredient-scaling";
import {
  MAXIMUM_MEAL_SELECTION_HISTORY_PLANS,
  selectMealPlanCandidates,
  type RecentMealSelectionPlan,
} from "../../../src/lib/domain/meal-plan-selection";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getPlanSlots } from "../activePlan";
import { requireUserId } from "../auth";
import { getCatalogueMeal, getCurrentCatalogueMeals } from "../catalogue";
import { getMealSelectionSignals, recipeSelectionKey } from "../mealSelection";
import { type SpaceId } from "../spaces";
import {
  defaultPlanServings,
  maximumPersonalPlanCandidates,
  type PlanCandidate,
  type PlanRecipeChoice,
} from "./model";
import { resolvePlanRecipes } from "./views";

export async function buildRegenerationProposal(
  ctx: QueryCtx | MutationCtx,
  mealPlan: Doc<"mealPlans">,
  ownerId: SpaceId,
  variant: number,
): Promise<
  | { status: "plan_unavailable" }
  | {
      status: "ready";
      mealSlots: Array<{
        date: string;
        catalogueMealId: string | null;
        catalogueMealSlug: string | null;
        title: string;
        prepMinutes: number | null;
        cookMinutes: number | null;
        isChanged: boolean;
        previousTitle: string;
        servingNotice?: string;
      }>;
      mealChoices: PlanRecipeChoice[];
    }
> {
  const mealSlots = await getPlanSlots(ctx, mealPlan._id);
  const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerId);
  if (mealSlots.length === 0 || recipesBySlot.size !== mealSlots.length) {
    return { status: "plan_unavailable" };
  }

  const candidatePool = await getPlanningCandidates(ctx, ownerId);
  const currentCandidateKeys = mealSlots.map((slot) =>
    candidateKeyForRecipe(recipesBySlot.get(slot._id)!),
  );
  const selectedCandidateKeys = await selectPlanCandidateKeys({
    ctx,
    ownerId,
    candidatePool,
    excludedCandidateKeys: currentCandidateKeys,
    numberOfMeals: mealSlots.length,
    variationKey: `replan:${mealPlan._id}:${mealPlan.updatedAt}:${variant}`,
  });
  const selectedCandidates = selectedCandidateKeys.map((key) =>
    candidatePool.byKey.get(key)!,
  );
  let replacementIndex = 0;

  const mealChoices: PlanRecipeChoice[] = [];
  for (const slot of mealSlots) {
    const selectedCandidate = selectedCandidates[replacementIndex++]!;

    mealChoices.push({
      date: slot.date,
      recipe: selectedCandidate.recipe,
      status: "planned" as const,
    });
  }
  replacementIndex = 0;
  const proposalMealSlots: Array<{
    date: string;
    catalogueMealId: string | null;
    catalogueMealSlug: string | null;
    title: string;
    prepMinutes: number | null;
    cookMinutes: number | null;
    isChanged: boolean;
    previousTitle: string;
    servingNotice?: string;
  }> = [];
  for (let index = 0; index < mealChoices.length; index += 1) {
    const mealSlot = mealSlots[index]!;
    const currentRecipe = recipesBySlot.get(mealSlot._id)!;
    const candidate = selectedCandidates[replacementIndex++]!;

    proposalMealSlots.push({
      date: mealSlot.date,
      catalogueMealId: candidate.catalogueMealId,
      catalogueMealSlug: candidate.catalogueMealSlug,
      title: candidate.title,
      prepMinutes: candidate.prepMinutes,
      cookMinutes: candidate.cookMinutes,
      isChanged: candidate.key !== currentCandidateKeys[index],
      previousTitle: currentRecipe.title,
      servingNotice:
        minimumServingsNotice(
          candidate,
          mealPlan.servings ?? defaultPlanServings,
        ) ?? undefined,
    });
  }

  return {
    status: "ready",
    mealSlots: proposalMealSlots,
    mealChoices,
  };
}

export async function getPlanningCandidates(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
) {
  const actorId = await requireUserId(ctx);
  const signals = await getMealSelectionSignals(ctx, ownerId);
  const byKey = new Map<string, PlanCandidate>();
  // Private imports stay private. Household imports become eligible only after
  // somebody has explicitly put a snapshot into the shared space.
  const recipes =
    ownerId === actorId
      ? await ctx.db
          .query("recipes")
          .withIndex("by_owner_and_saved_at", (q) =>
            q.eq("ownerId", actorId).gt("savedAt", 0),
          )
          .order("desc")
          .take(maximumPersonalPlanCandidates)
      : await ctx.db
          .query("recipes")
          .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
          .order("desc")
          .take(maximumPersonalPlanCandidates);
  for (const recipe of recipes) {
    // Use the current public revision for catalogue meals, not a member's edited copy.
    if (ownerId !== actorId && recipe.source.type === "catalogue") continue;
    const candidate = await planCandidateFromRecipe(ctx, recipe);
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
  }
  for (const catalogueMeal of await getCurrentCatalogueMeals(ctx)) {
    const candidate = planCandidateFromCatalogue(catalogueMeal);
    if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
  }
  for (const [key, candidate] of byKey) {
    byKey.set(key, { ...candidate, ...signals.get(key) });
  }
  return { byKey };
}

export async function selectAdditionalPlanCandidates(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
  mealPlan: Doc<"mealPlans">,
  mealSlots: Array<Doc<"mealSlots">>,
  numberOfMeals: number,
  targetPlanDays: number,
): Promise<PlanCandidate[] | null> {
  const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerId);
  if (recipesBySlot.size !== mealSlots.length) return null;

  const candidatePool = await getPlanningCandidates(ctx, ownerId);
  const selectedKeys = await selectPlanCandidateKeys({
    ctx,
    ownerId,
    candidatePool,
    excludedCandidateKeys: [...recipesBySlot.values()].map(
      candidateKeyForRecipe,
    ),
    retainedRecipes: [...recipesBySlot.values()],
    numberOfMeals,
    variationKey: `extend:${mealPlan._id}:${mealPlan.updatedAt}:${targetPlanDays}`,
  });
  const candidates = selectedKeys.flatMap((key) => {
    const candidate = candidatePool.byKey.get(key);
    return candidate === undefined ? [] : [candidate];
  });

  return candidates.length === numberOfMeals ? candidates : null;
}

export async function selectPlanCandidateKeys({
  ctx,
  ownerId,
  candidatePool,
  excludedCandidateKeys,
  numberOfMeals,
  variationKey,
  retainedRecipes = [],
}: {
  ctx: QueryCtx | MutationCtx;
  ownerId: SpaceId;
  candidatePool: Awaited<ReturnType<typeof getPlanningCandidates>>;
  retainedRecipes?: readonly Doc<"recipes">[];
  excludedCandidateKeys: readonly string[];
  numberOfMeals: number;
  variationKey: string;
}): Promise<string[]> {
  const actorId = await requireUserId(ctx);
  const [recentPlans, preferences] = await Promise.all([
    getRecentSelectionHistory(ctx, ownerId),
    ctx.db
      .query("planningPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", actorId))
      .unique(),
  ]);
  return selectMealPlanCandidates(
    [...candidatePool.byKey.values()].map((candidate) => ({
      key: candidate.key,
      proteinCategory: candidate.proteinCategory,
      isSaved: candidate.isSaved,
      savedByMemberKeys: candidate.savedByMemberKeys,
      dismissalCount: candidate.dismissalCount,
    })),
    {
      numberOfMeals,
      retainedCandidates: retainedRecipes.map(
        (recipe) =>
          candidatePool.byKey.get(recipeSelectionKey(recipe)) ?? {
            key: recipeSelectionKey(recipe),
            proteinCategory: recipe.proteinCategory,
            isSaved: false,
          },
      ),
      excludedCandidateKeys,
      recentPlans,
      prioritiseSavedRecipes: preferences?.prioritiseSavedRecipes ?? true,
      variationKey,
    },
  ).map((decision) => decision.candidateKey);
}

export async function getRecentSelectionHistory(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
): Promise<RecentMealSelectionPlan[]> {
  const plans = await getRecentPlansForSelection(ctx, ownerId);
  const history: RecentMealSelectionPlan[] = [];
  for (const plan of plans) {
    const recipes = await getPlanRecipesForSelection(ctx, plan, ownerId);
    history.push({
      candidateKeys: recipes.map(candidateKeyForRecipe),
      proteinCategories: recipes.map((recipe) => recipe.proteinCategory),
    });
  }
  return history;
}

export async function getPlanRecipesForSelection(
  ctx: QueryCtx | MutationCtx,
  plan: Doc<"mealPlans">,
  ownerId: SpaceId,
) {
  const slots = await getPlanSlots(ctx, plan._id);
  const recipes = await resolvePlanRecipes(ctx, slots, ownerId);
  return [...recipes.values()];
}

export async function getRecentPlansForSelection(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
): Promise<Array<Doc<"mealPlans">>> {
  const [activePlans, archivedPlans] = await Promise.all([
    ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active"),
      )
      .order("desc")
      .take(1),
    ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "archived"),
      )
      .order("desc")
      .take(MAXIMUM_MEAL_SELECTION_HISTORY_PLANS),
  ]);
  return [
    ...activePlans,
    ...archivedPlans.slice(
      0,
      MAXIMUM_MEAL_SELECTION_HISTORY_PLANS - activePlans.length,
    ),
  ];
}

export async function planCandidateFromRecipe(
  ctx: QueryCtx | MutationCtx,
  recipe: Doc<"recipes">,
): Promise<PlanCandidate> {
  const catalogueMeal =
    recipe.source.type === "catalogue"
      ? await getCatalogueMeal(
          ctx,
          recipe.source.catalogueMealId,
          recipe.source.catalogueVersion,
        )
      : null;

  return {
    key: candidateKeyForRecipe(recipe),
    recipe: { type: "existing", recipeId: recipe._id },
    catalogueMealId: catalogueMeal?.catalogueMealId ?? null,
    catalogueMealSlug: catalogueMeal?.slug ?? null,
    title: recipe.title,
    servings: recipe.servings,
    minimumServings: recipe.minimumServings,
    servingScaling: recipeServingScaling(recipe),
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    proteinCategory: recipe.proteinCategory,
    isSaved: recipe.savedAt !== undefined,
  };
}

export function planCandidateFromCatalogue(
  catalogueMeal: Doc<"catalogueMeals">,
): PlanCandidate {
  return {
    key: `catalogue:${catalogueMeal.catalogueMealId}`,
    recipe: {
      type: "catalogue",
      catalogueMealId: catalogueMeal.catalogueMealId,
      catalogueVersion: catalogueMeal.version,
    },
    catalogueMealId: catalogueMeal.catalogueMealId,
    catalogueMealSlug: catalogueMeal.slug,
    title: catalogueMeal.title,
    servings: catalogueMeal.servings,
    minimumServings: catalogueMeal.minimumServings,
    servingScaling: catalogueMeal.servingScaling,
    prepMinutes: catalogueMeal.prepMinutes ?? null,
    cookMinutes: catalogueMeal.cookMinutes ?? null,
    proteinCategory: catalogueMeal.proteinCategory,
    isSaved: false,
  };
}

export const candidateKeyForRecipe = recipeSelectionKey;
