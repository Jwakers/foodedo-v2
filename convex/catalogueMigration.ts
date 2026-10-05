import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { recipeContentFields } from "./lib/recipeValidators";

const stagedMealValidator = v.object({
  catalogueMealId: v.string(),
  version: v.number(),
  slug: v.string(),
  position: v.number(),
  content: v.object(recipeContentFields),
  imageStorageId: v.optional(v.id("_storage")),
  createdAt: v.number(),
});

const replacementValidator = v.object({
  catalogueMealId: v.string(),
  version: v.number(),
  slug: v.string(),
  content: v.object(recipeContentFields),
});

function comparableMeal(meal: Doc<"catalogueMeals">) {
  const comparable = { ...meal } as Partial<Doc<"catalogueMeals">>;
  delete comparable._id;
  delete comparable._creationTime;
  delete comparable.status;
  delete comparable.publishedAt;
  return comparable;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const inspect = internalQuery({
  args: {},
  handler: async (ctx) => {
    const meals = await ctx.db.query("catalogueMeals").collect();
    const statuses = { staging: 0, published: 0, retired: 0 };
    for (const meal of meals) statuses[meal.status] += 1;
    const published = meals
      .filter((meal) => meal.status === "published")
      .sort((a, b) => a.position - b.position);
    return {
      count: meals.length,
      statuses,
      homeMealIds: published.slice(0, 6).map((meal) => meal.catalogueMealId),
      dataCounts: {
        users: (await ctx.db.query("users").collect()).length,
        planningPreferences: (
          await ctx.db.query("planningPreferences").collect()
        ).length,
        recipes: (await ctx.db.query("recipes").collect()).length,
        recipeImports: (await ctx.db.query("recipeImports").collect()).length,
        mealPlans: (await ctx.db.query("mealPlans").collect()).length,
        mealSlots: (await ctx.db.query("mealSlots").collect()).length,
        shoppingLists: (await ctx.db.query("shoppingLists").collect()).length,
        shoppingListItems: (await ctx.db.query("shoppingListItems").collect())
          .length,
        guestClaims: (await ctx.db.query("guestClaims").collect()).length,
        storedFiles: (await ctx.db.system.query("_storage").collect()).length,
      },
    };
  },
});

export const exportCatalogue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const meals = await ctx.db.query("catalogueMeals").collect();
    return await Promise.all(
      meals.map(async (meal) => ({
        ...meal,
        imageUrl:
          meal.imageStorageId === undefined
            ? null
            : await ctx.storage.getUrl(meal.imageStorageId),
        imageMetadata:
          meal.imageStorageId === undefined
            ? null
            : await ctx.db.system.get("_storage", meal.imageStorageId),
      })),
    );
  },
});

export const generateUploadUrls = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new Error("Upload URL count must be an integer from 1 to 20.");
    }
    return await Promise.all(
      Array.from({ length: count }, () => ctx.storage.generateUploadUrl()),
    );
  },
});

export const clearCatalogue = internalMutation({
  args: { expectedCount: v.number() },
  handler: async (ctx, { expectedCount }) => {
    const meals = await ctx.db.query("catalogueMeals").collect();
    if (meals.length !== expectedCount) {
      throw new Error(
        `Catalogue clear expected ${expectedCount} rows but found ${meals.length}.`,
      );
    }

    const personalRecipes = await ctx.db.query("recipes").collect();
    const retainedStorageIds = new Set(
      personalRecipes.flatMap((recipe) =>
        recipe.imageStorageId === undefined ? [] : [recipe.imageStorageId],
      ),
    );
    const candidateStorageIds = new Set(
      meals.flatMap((meal) =>
        meal.imageStorageId === undefined ? [] : [meal.imageStorageId],
      ),
    );

    for (const meal of meals) await ctx.db.delete(meal._id);

    let deletedImages = 0;
    let preservedImages = 0;
    for (const storageId of candidateStorageIds) {
      if (retainedStorageIds.has(storageId)) {
        preservedImages += 1;
        continue;
      }
      await ctx.storage.delete(storageId);
      deletedImages += 1;
    }
    return {
      deletedRows: meals.length,
      deletedImages,
      preservedImages,
      personalRecipeCount: personalRecipes.length,
    };
  },
});

export const stageBatch = internalMutation({
  args: { meals: v.array(stagedMealValidator) },
  handler: async (ctx, { meals }) => {
    if (meals.length < 1 || meals.length > 20) {
      throw new Error("Stage batches must contain from 1 to 20 meals.");
    }
    let inserted = 0;
    let unchanged = 0;
    for (const meal of meals) {
      if (meal.imageStorageId !== undefined) {
        const image = await ctx.db.system.get("_storage", meal.imageStorageId);
        if (image === null)
          throw new Error(`Missing image for ${meal.catalogueMealId}.`);
      }
      const existing = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", meal.catalogueMealId)
            .eq("version", meal.version),
        )
        .unique();
      const document = {
        catalogueMealId: meal.catalogueMealId,
        version: meal.version,
        status: "staging" as const,
        slug: meal.slug,
        position: meal.position,
        ...meal.content,
        ...(meal.imageStorageId === undefined
          ? {}
          : { imageStorageId: meal.imageStorageId }),
        createdAt: meal.createdAt,
      };
      if (existing !== null) {
        if (
          stableJson(comparableMeal(existing)) !==
          stableJson({
            catalogueMealId: document.catalogueMealId,
            version: document.version,
            slug: document.slug,
            position: document.position,
            ...meal.content,
            ...(document.imageStorageId === undefined
              ? {}
              : { imageStorageId: document.imageStorageId }),
            createdAt: document.createdAt,
          })
        ) {
          throw new Error(`Conflicting staged meal ${meal.catalogueMealId}.`);
        }
        unchanged += 1;
        continue;
      }
      await ctx.db.insert("catalogueMeals", document);
      inserted += 1;
    }
    return { inserted, unchanged };
  },
});

export const attachStagingImage = internalMutation({
  args: {
    catalogueMealId: v.string(),
    version: v.number(),
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const meal = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_meal_id_and_version", (q) =>
        q
          .eq("catalogueMealId", args.catalogueMealId)
          .eq("version", args.version),
      )
      .unique();
    if (meal === null || meal.status !== "staging") {
      throw new Error(`Missing staging meal ${args.catalogueMealId}.`);
    }
    if ((await ctx.db.system.get("_storage", args.imageStorageId)) === null) {
      throw new Error(
        `Replacement image is missing for ${args.catalogueMealId}.`,
      );
    }
    const previous = meal.imageStorageId;
    await ctx.db.patch(meal._id, { imageStorageId: args.imageStorageId });
    if (previous !== undefined && previous !== args.imageStorageId) {
      const recipeReference = (await ctx.db.query("recipes").collect()).some(
        (recipe) => recipe.imageStorageId === previous,
      );
      const catalogueReference = (
        await ctx.db.query("catalogueMeals").collect()
      ).some((candidate) => candidate.imageStorageId === previous);
      if (!recipeReference && !catalogueReference)
        await ctx.storage.delete(previous);
    }
    return { attached: true };
  },
});

export const replaceStagingBatch = internalMutation({
  args: {
    keep: v.array(replacementValidator),
    remove: v.array(
      v.object({ catalogueMealId: v.string(), version: v.number() }),
    ),
  },
  handler: async (ctx, { keep, remove }) => {
    if (keep.length + remove.length > 20) {
      throw new Error("Review batches may affect at most 20 meals.");
    }
    for (const replacement of keep) {
      const existing = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", replacement.catalogueMealId)
            .eq("version", replacement.version),
        )
        .unique();
      if (existing === null || existing.status !== "staging") {
        throw new Error(`Missing staging meal ${replacement.catalogueMealId}.`);
      }
      await ctx.db.patch(existing._id, {
        slug: replacement.slug,
        ...replacement.content,
      });
    }
    let removed = 0;
    for (const target of remove) {
      const existing = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", target.catalogueMealId)
            .eq("version", target.version),
        )
        .unique();
      if (existing === null) continue;
      if (existing.status !== "staging") {
        throw new Error(
          `Refusing to remove non-staging meal ${target.catalogueMealId}.`,
        );
      }
      const storageId = existing.imageStorageId;
      await ctx.db.delete(existing._id);
      if (storageId !== undefined) {
        const personalReference = (
          await ctx.db.query("recipes").collect()
        ).some((recipe) => recipe.imageStorageId === storageId);
        const catalogueReference = (
          await ctx.db.query("catalogueMeals").collect()
        ).some((meal) => meal.imageStorageId === storageId);
        if (!personalReference && !catalogueReference)
          await ctx.storage.delete(storageId);
      }
      removed += 1;
    }
    return { kept: keep.length, removed };
  },
});

export const auditStaging = internalQuery({
  args: {},
  handler: async (ctx) => {
    const staging = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "staging"))
      .collect();
    const published = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
      .collect();
    const ids = new Set<string>();
    const slugs = new Set<string>();
    const errors: string[] = [];
    for (const meal of staging) {
      if (ids.has(meal.catalogueMealId))
        errors.push(`duplicate id:${meal.catalogueMealId}`);
      if (slugs.has(meal.slug)) errors.push(`duplicate slug:${meal.slug}`);
      if (meal.ingredients.length === 0)
        errors.push(`no ingredients:${meal.catalogueMealId}`);
      if (meal.steps.length === 0)
        errors.push(`no steps:${meal.catalogueMealId}`);
      if (meal.imageStorageId === undefined)
        errors.push(`no image:${meal.catalogueMealId}`);
      else if (
        (await ctx.db.system.get("_storage", meal.imageStorageId)) === null
      ) {
        errors.push(`missing image:${meal.catalogueMealId}`);
      }
      ids.add(meal.catalogueMealId);
      slugs.add(meal.slug);
    }
    return {
      stagingCount: staging.length,
      publishedCount: published.length,
      errors,
    };
  },
});

export const publishStaging = internalMutation({
  args: {
    orderedMealIds: v.array(v.string()),
    publishedAt: v.number(),
  },
  handler: async (ctx, { orderedMealIds, publishedAt }) => {
    const staging = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "staging"))
      .collect();
    const published = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
      .collect();
    if (published.length !== 0) {
      throw new Error(
        "Publishing requires no currently published catalogue rows.",
      );
    }
    if (orderedMealIds.length !== staging.length) {
      throw new Error(
        "Published order must include every staging meal exactly once.",
      );
    }
    const uniqueIds = new Set(orderedMealIds);
    if (uniqueIds.size !== orderedMealIds.length)
      throw new Error("Published IDs repeat.");
    const byMealId = new Map(
      staging.map((meal) => [meal.catalogueMealId, meal]),
    );
    for (const mealId of orderedMealIds) {
      const meal = byMealId.get(mealId);
      if (meal === undefined)
        throw new Error(`Unknown staging meal ${mealId}.`);
      if (meal.imageStorageId === undefined)
        throw new Error(`Missing image for ${mealId}.`);
      if ((await ctx.db.system.get("_storage", meal.imageStorageId)) === null) {
        throw new Error(`Missing stored image for ${mealId}.`);
      }
    }
    for (const [position, mealId] of orderedMealIds.entries()) {
      await ctx.db.patch(byMealId.get(mealId)!._id, {
        status: "published",
        position,
        publishedAt,
      });
    }
    return { published: orderedMealIds.length, publishedAt };
  },
});

export const deleteImages = internalMutation({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    if (storageIds.length > 20)
      throw new Error("Delete images in batches of 20.");
    const recipes = await ctx.db.query("recipes").collect();
    const meals = await ctx.db.query("catalogueMeals").collect();
    let deleted = 0;
    for (const storageId of storageIds) {
      if (
        recipes.some((recipe) => recipe.imageStorageId === storageId) ||
        meals.some((meal) => meal.imageStorageId === storageId)
      ) {
        continue;
      }
      await ctx.storage.delete(storageId as Id<"_storage">);
      deleted += 1;
    }
    return { deleted };
  },
});
