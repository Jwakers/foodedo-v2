import { expect, test } from "vitest";
import { convexTest } from "../tests/convex-test";
import schema from "./schema";
import { analysisSnapshot } from "./lib/catalogueGeneration/catalogue";
import {
  currentCuisineReview,
  saveCuisineReview,
} from "./lib/catalogueCuisines";
import {
  catalogueStatistics,
  recipeFingerprint,
} from "../src/lib/domain/catalogue-generation";
import { CUISINES, normaliseCuisines } from "../src/lib/domain/cuisines";

const modules = import.meta.glob("./**/*.ts");
async function setup(cuisines = ["Korean", "mexican", "korean"]) {
  const t = convexTest(schema, modules);
  const mealId = await t.run(async (ctx) => {
    const meal = {
      catalogueMealId: "fusion-tacos",
      version: 1,
      status: "published" as const,
      slug: "fusion-tacos",
      position: 0,
      title: "Korean Mexican Tacos",
      ingredients: [
        { id: "tofu", name: "tofu", shoppingCategory: "pantry" as const },
      ],
      steps: [{ id: "cook", text: "Cook tofu and fill tortillas." }],
      proteinCategory: "meat-free" as const,
      createdAt: 1,
    };
    const id = await ctx.db.insert("catalogueMeals", meal);
    await saveCuisineReview(ctx, {
      mealId: id,
      fingerprint: await recipeFingerprint(meal),
      cuisines,
      rationale: "Reviewed influences.",
      reviewedBy: "editor",
      reviewedAt: 1,
    });
    return id;
  });
  return { t, mealId };
}

test("a missing cuisine review returns null and leaves the catalogue meal unclassified", async () => {
  const { t, mealId } = await setup();
  await t.run(async (ctx) => {
    const review = await ctx.db
      .query("catalogueCuisineMetadata")
      .withIndex("by_meal", (q) => q.eq("mealId", mealId))
      .unique();
    await ctx.db.delete(review!._id);
  });
  expect(
    await t.run(async (ctx) => {
      const meal = (await ctx.db.get(mealId))!;
      return currentCuisineReview(ctx, mealId, await recipeFingerprint(meal));
    }),
  ).toBeNull();
  const meals = await t.run((ctx) => analysisSnapshot(ctx));
  expect(meals[0].cuisines).toBeUndefined();
  expect(catalogueStatistics(meals).cuisineUnclassified).toBe(1);
});

test("independent reviews expose fusion coverage and zero counts without approving unrelated tags", async () => {
  const { t, mealId } = await setup();
  const before = await t.run((ctx) => ctx.db.get(mealId));
  const meals = await t.run((ctx) => analysisSnapshot(ctx));
  expect(meals[0].tags).toBeUndefined();
  expect(meals[0].cuisines).toEqual(["korean", "mexican"]);
  const stats = catalogueStatistics(meals);
  expect(stats).toMatchObject({
    classified: 0,
    cuisineClassified: 1,
    cuisineUnclassified: 0,
  });
  expect(stats.cuisines).toHaveLength(CUISINES.length);
  expect(stats.cuisines).toEqual(
    expect.arrayContaining([
      { value: "korean", count: 1 },
      { value: "mexican", count: 1 },
      { value: "indian", count: 0 },
    ]),
  );
  expect(await t.run((ctx) => ctx.db.get(mealId))).toEqual(before);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueAnalysisMetadata").collect()),
  ).toEqual([]);
});

test("stale content, stale taxonomy and retired revisions never contribute independent cuisines", async () => {
  const { t, mealId } = await setup();
  await t.run(async (ctx) => {
    const review = await ctx.db
      .query("catalogueCuisineMetadata")
      .withIndex("by_meal", (q) => q.eq("mealId", mealId))
      .unique();
    await ctx.db.patch(review!._id, { taxonomyVersion: "old-taxonomy" });
  });
  expect(
    (await t.run((ctx) => analysisSnapshot(ctx)))[0].cuisines,
  ).toBeUndefined();
  await t.run((ctx) => ctx.db.patch(mealId, { description: "Changed recipe" }));
  expect(
    catalogueStatistics(await t.run((ctx) => analysisSnapshot(ctx)))
      .cuisineUnclassified,
  ).toBe(1);
  await t.run((ctx) => ctx.db.patch(mealId, { status: "retired" }));
  expect(await t.run((ctx) => analysisSnapshot(ctx))).toEqual([]);
});

test("an explicitly unclassified review overrides general cuisine suggestions", async () => {
  const { t, mealId } = await setup([]);
  await t.run(async (ctx) => {
    const meal = (await ctx.db.get(mealId))!;
    await ctx.db.insert("catalogueAnalysisMetadata", {
      catalogueMealId: meal.catalogueMealId,
      catalogueVersion: 1,
      fingerprint: await recipeFingerprint(meal),
      status: "reviewed",
      reviewedBy: "other-editor",
      reviewedAt: 0,
      createdAt: 0,
      tags: {
        cuisines: ["italian"],
        mealOccasion: "dinner",
        cookingMethods: [],
        proteinSource: "tofu",
        carbBase: "tortillas",
        flavourProfile: [],
        complexity: "simple",
        vegetarian: "yes",
        vegan: "yes",
      },
    });
  });
  const stats = catalogueStatistics(
    await t.run((ctx) => analysisSnapshot(ctx)),
  );
  expect(stats.cuisineUnclassified).toBe(1);
  expect(stats.cuisines.every((row) => row.count === 0)).toBe(true);
});

test("cuisine normalisation rejects unsupported labels", () => {
  expect(normaliseCuisines(["Middle Eastern", "middle_eastern"])).toEqual([
    "middle-eastern",
  ]);
  expect(() => normaliseCuisines(["fusion"])).toThrow("Unknown cuisine");
});
