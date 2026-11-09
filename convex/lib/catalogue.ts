import { RECIPE_LIMITS } from "../../src/lib/domain/recipes";
import { recipeAllergyEvidence } from "../../src/lib/domain/allergies";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recipeServingScaling } from "../../src/lib/domain/ingredient-scaling";
import {
  hasCurrentIngredientMappings,
  withStepIngredientMappings,
} from "../../src/lib/domain/step-ingredients";

type ReadCtx = QueryCtx | MutationCtx;
type ReadableCatalogueMeal = Doc<"catalogueMeals"> & {
  imageStorageId: Id<"_storage">;
  publishedAt: number;
};

export async function getCurrentCatalogueMeals(ctx: ReadCtx) {
  const meals = await ctx.db
    .query("catalogueMeals")
    .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
    .take(RECIPE_LIMITS.catalogueMeals + 1);
  if (meals.length > RECIPE_LIMITS.catalogueMeals)
    throw new Error(
      "Catalogue exceeds the supported size; increase the complete-read limit deliberately.",
    );
  assertUniqueCurrentCatalogue(meals);
  return meals;
}

function assertUniqueCurrentCatalogue(
  meals: Doc<"catalogueMeals">[],
): asserts meals is ReadableCatalogueMeal[] {
  const mealIds = new Set<string>();
  const slugs = new Set<string>();
  const positions = new Set<number>();
  for (const meal of meals) {
    if (mealIds.has(meal.catalogueMealId)) {
      throw new Error("A catalogue meal has multiple published revisions.");
    }
    if (slugs.has(meal.slug)) {
      throw new Error("Published catalogue meal slugs must be unique.");
    }
    if (positions.has(meal.position)) {
      throw new Error("Published catalogue meal positions must be unique.");
    }
    assertReadableCatalogueMeal(meal);
    mealIds.add(meal.catalogueMealId);
    slugs.add(meal.slug);
    positions.add(meal.position);
  }
}

export async function getCatalogueMeal(
  ctx: ReadCtx,
  catalogueMealId: string,
  catalogueVersion: number,
) {
  const meal = await ctx.db
    .query("catalogueMeals")
    .withIndex("by_meal_id_and_version", (q) =>
      q.eq("catalogueMealId", catalogueMealId).eq("version", catalogueVersion),
    )
    .unique();
  if (meal === null || meal.status === "staging") return null;
  assertReadableCatalogueMeal(meal);
  return meal;
}

function assertReadableCatalogueMeal(
  meal: Doc<"catalogueMeals">,
): asserts meal is ReadableCatalogueMeal {
  if (meal.publishedAt === undefined) {
    throw new Error("A published catalogue meal must have a publication time.");
  }
  if (meal.imageStorageId === undefined) {
    throw new Error("A published catalogue meal must have an image.");
  }
}

export async function catalogueImageUrl(
  ctx: ReadCtx,
  imageStorageId: Doc<"catalogueMeals">["imageStorageId"],
) {
  if (imageStorageId === undefined) return undefined;
  return (await ctx.storage.getUrl(imageStorageId)) ?? undefined;
}

export async function catalogueMealSummary(
  ctx: ReadCtx,
  meal: Doc<"catalogueMeals">,
) {
  assertReadableCatalogueMeal(meal);
  const [imageSrc, enriched] = await Promise.all([
    catalogueImageUrl(ctx, meal.imageStorageId),
    enrichedCatalogueMeal(ctx, meal),
  ]);
  const servingScaling = recipeServingScaling(enriched);
  if (imageSrc === undefined) {
    throw new Error("A readable catalogue meal must have a stored image.");
  }
  return {
    ...recipeAllergyEvidence(meal),
    id: meal.catalogueMealId,
    version: meal.version,
    slug: meal.slug,
    position: meal.position,
    title: meal.title,
    ...(meal.description === undefined
      ? {}
      : { description: meal.description }),
    ...(meal.servings === undefined ? {} : { servings: meal.servings }),
    servingScaling,
    ...(meal.minimumServings === undefined
      ? {}
      : { minimumServings: meal.minimumServings }),
    ...(meal.prepMinutes === undefined
      ? {}
      : { prepMinutes: meal.prepMinutes }),
    ...(meal.cookMinutes === undefined
      ? {}
      : { cookMinutes: meal.cookMinutes }),
    proteinCategory: meal.proteinCategory,
    ...(meal.costBand === undefined ? {} : { costBand: meal.costBand }),
    ...(imageSrc === undefined ? {} : { imageSrc }),
  };
}

/** Both listing and detail reads use the same materialised enrichment. */
async function enrichedCatalogueMeal(
  ctx: ReadCtx,
  meal: Doc<"catalogueMeals">,
) {
  let enriched = meal;
  if (!hasCurrentIngredientMappings(meal)) {
    const stored = await ctx.db
      .query("catalogueIngredientMappings")
      .withIndex("by_meal", (q) => q.eq("mealId", meal._id))
      .unique();
    if (stored) {
      const mappings = new Map(
        stored.steps.map((step) => [step.id, step.ingredientMapping]),
      );
      enriched = {
        ...meal,
        steps: meal.steps.map((step) => ({
          ...step,
          ingredientMapping: mappings.get(step.id),
        })),
      };
    }
  }
  return withStepIngredientMappings(enriched);
}

export async function catalogueMealView(
  ctx: ReadCtx,
  meal: Doc<"catalogueMeals">,
) {
  const enriched = await enrichedCatalogueMeal(ctx, meal);
  const summary = await catalogueMealSummary(ctx, enriched);
  return {
    ...summary,
    ingredients: meal.ingredients,
    steps: enriched.steps,
    ...(meal.preheat === undefined ? {} : { preheat: meal.preheat }),
    ...(meal.notes === undefined ? {} : { notes: meal.notes }),
    servingScaling: recipeServingScaling(enriched),
  };
}

/** Materialised keys keep global catalogue sorting compatible with cursor pagination. */
export function catalogueBrowseKeys(meal: {
  prepMinutes?: number;
  cookMinutes?: number;
  costBand?: "budget" | "standard" | "premium";
}) {
  return {
    browseDuration:
      meal.prepMinutes === undefined && meal.cookMinutes === undefined
        ? Number.MAX_SAFE_INTEGER
        : (meal.prepMinutes ?? 0) + (meal.cookMinutes ?? 0),
    browseCostRank:
      meal.costBand === "budget"
        ? 0
        : meal.costBand === "standard"
          ? 1
          : meal.costBand === "premium"
            ? 2
            : 3,
  };
}
