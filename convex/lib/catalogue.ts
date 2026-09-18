import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;
type ReadableCatalogueMeal = Doc<"catalogueMeals"> & {
  imageStorageId: Id<"_storage">;
  publishedAt: number;
};

export async function getCurrentCatalogueMeals(ctx: ReadCtx) {
  const meals = await ctx.db
    .query("catalogueMeals")
    .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
    .collect();
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
  const imageSrc = await catalogueImageUrl(ctx, meal.imageStorageId);
  if (imageSrc === undefined) {
    throw new Error("A readable catalogue meal must have a stored image.");
  }
  return {
    id: meal.catalogueMealId,
    version: meal.version,
    slug: meal.slug,
    position: meal.position,
    title: meal.title,
    ...(meal.description === undefined
      ? {}
      : { description: meal.description }),
    ...(meal.servings === undefined ? {} : { servings: meal.servings }),
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

export async function catalogueMealView(
  ctx: ReadCtx,
  meal: Doc<"catalogueMeals">,
) {
  const summary = await catalogueMealSummary(ctx, meal);
  return {
    ...summary,
    ingredients: meal.ingredients,
    steps: meal.steps,
    ...(meal.preheat === undefined ? {} : { preheat: meal.preheat }),
  };
}
