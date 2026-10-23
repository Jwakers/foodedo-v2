import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { syncShoppingListForPlan } from "./lib/shoppingListSync";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";
const modules = import.meta.glob("./**/*.ts");

test("snapshots, plan views and shopping use per-recipe minimums and preserve reconciliation state", async () => {
  const t = convexTest(schema, modules);
  const { planId, ownerId, recipeId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "minimum",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const imageStorageId = await ctx.storage.store(new Blob(["image"]));
    const base = {
      title: "Lasagne",
      servings: 6,
      minimumServings: 4,
      proteinCategory: "beef" as const,
      ingredients: [
        {
          id: "mince",
          name: "mince",
          quantity: "600",
          unit: "g",
          shoppingCategory: "meat_and_fish" as const,
        },
      ],
      steps: [{ id: "bake", text: "Bake." }],
    };
    await ctx.db.insert("catalogueMeals", {
      ...base,
      catalogueMealId: "lasagne",
      version: 1,
      slug: "lasagne",
      position: 0,
      status: "published",
      imageStorageId,
      createdAt: 1,
      publishedAt: 1,
    });
    const { recipeId } = await getOrCreateCatalogueRecipe(ctx, {
      ownerId,
      catalogueMealId: "lasagne",
      catalogueVersion: 1,
      saveToLibrary: false,
    });
    const ordinaryId = await ctx.db.insert("recipes", {
      ...base,
      title: "Ordinary",
      minimumServings: undefined,
      ownerId,
      source: { type: "manual" },
      updatedAt: 1,
    });
    const sourceOnlyId = await ctx.db.insert("recipes", {
      ...base,
      title: "As written",
      servingScaling: "source_only",
      ownerId,
      source: { type: "manual" },
      updatedAt: 1,
    });
    const planId = await ctx.db.insert("mealPlans", {
      ownerId,
      servings: 2,
      startDate: "2026-10-23",
      endDate: "2026-10-26",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [i, id] of [
      recipeId,
      ordinaryId,
      recipeId,
      sourceOnlyId,
    ].entries())
      await ctx.db.insert("mealSlots", {
        ownerId,
        mealPlanId: planId,
        date: `2026-10-${23 + i}`,
        recipeId: id,
        status: "planned",
        createdAt: 1,
        updatedAt: 1,
      });
    await syncShoppingListForPlan(ctx, ownerId, planId);
    return { ownerId, planId, recipeId };
  });
  const user = t.withIdentity({ subject: "minimum" });
  const snapshot = await user.query(api.recipes.getMine, { recipeId });
  expect(snapshot?.minimumServings).toBe(4);
  const plan = await user.query(api.mealPlans.getCurrent, {});
  expect(plan?.servings).toBe(2);
  expect(plan?.mealSlots[0]).toMatchObject({ servings: 6, minimumServings: 4 });
  const read = async () => {
    const result = await user.query(api.shoppingLists.getCurrent, {});
    if (result.status !== "ready" || !result.list)
      throw new Error("Expected a shopping list");
    return result.list.items[0];
  };
  const item = await read();
  expect(item.sources.map((s) => s.amount)).toEqual([
    "400 g",
    "200 g",
    "400 g",
    "600 g",
  ]);
  expect(item.sources.every((s) => s.requestedServings === 2)).toBe(true);
  await t.run((ctx) =>
    ctx.db.patch(item._id, {
      sources: item.sources.map(({ recipeId, recipeTitle, date, amount }) => ({
        recipeId,
        recipeTitle,
        date,
        amount,
      })),
    }),
  );
  expect(
    (await read()).sources.every((source) => source.requestedServings === 2),
  ).toBe(true);
  // A legacy list must reconstruct the exact same per-occurrence amounts.
  await t.run((ctx) => ctx.db.patch(item._id, { sources: undefined }));
  expect((await read()).sources.map((s) => s.amount)).toEqual([
    "400 g",
    "200 g",
    "400 g",
    "600 g",
  ]);
  await t.run(async (ctx) => {
    await ctx.db.patch(item._id, { checked: true });
    await ctx.db.patch(planId, { servings: 5, updatedAt: 2 });
    await syncShoppingListForPlan(ctx, ownerId, planId);
  });
  expect((await read()).sources.map((s) => s.amount)).toEqual([
    "500 g",
    "500 g",
    "500 g",
    "600 g",
  ]);
  expect((await read()).checked).toBe(true);
});

test("owner correction clears inferred minimum provenance and allows removing the minimum", async () => {
  const t = convexTest(schema, modules);
  const content = {
    title: "Imported lasagne",
    servings: 6,
    minimumServings: 4,
    servingScaling: "safe" as const,
    proteinCategory: "beef" as const,
    ingredients: [
      {
        id: "mince",
        name: "mince",
        quantity: "600",
        unit: "g",
        shoppingCategory: "meat_and_fish" as const,
      },
    ],
    steps: [{ id: "bake", text: "Bake." }],
  };
  const recipeId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "editor",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    return ctx.db.insert("recipes", {
      ...content,
      ownerId,
      source: {
        type: "import",
        method: "text",
        importedAt: 1,
        metadataProvenance: {
          minimumServings: "estimated",
          servings: "published",
        },
      },
      updatedAt: 1,
    });
  });
  await t.run(async (ctx) => {
    const recipe = (await ctx.db.get(recipeId))!;
    for (const [index, status] of ["active", "archived"].entries()) {
      const planId = await ctx.db.insert("mealPlans", {
        ownerId: recipe.ownerId,
        servings: 2,
        startDate: `2026-10-${23 + index}`,
        endDate: `2026-10-${23 + index}`,
        status: status as "active" | "archived",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("mealSlots", {
        mealPlanId: planId,
        ownerId: recipe.ownerId,
        recipeId,
        date: `2026-10-${23 + index}`,
        status: "planned",
        createdAt: 1,
        updatedAt: 1,
      });
      await syncShoppingListForPlan(ctx, recipe.ownerId, planId);
    }
  });
  const user = t.withIdentity({ subject: "editor" });
  const changed = await user.mutation(api.recipes.updateImported, {
    recipeId,
    recipe: { ...content, minimumServings: 3 },
  });
  expect(changed?.minimumServings).toBe(3);
  const items = await t.run((ctx) =>
    ctx.db.query("shoppingListItems").collect(),
  );
  expect(items.map((item) => item.sources?.[0].amount)).toEqual([
    "300 g",
    "300 g",
  ]);
  expect(
    changed?.source.type === "import" && changed.source.metadataProvenance,
  ).toEqual({ servings: "published" });
  const removed = await user.mutation(api.recipes.updateImported, {
    recipeId,
    recipe: { ...content, minimumServings: undefined },
  });
  expect(removed?.minimumServings).toBeUndefined();
});
