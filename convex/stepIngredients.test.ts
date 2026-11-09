import { convexTest } from "../tests/convex-test";
import { expect, test, vi } from "vitest";
import * as ingredientMappings from "../src/lib/domain/step-ingredients";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { RecipeContent } from "../src/lib/domain/recipes";

const modules = import.meta.glob("./**/*.ts");
const content: RecipeContent = {
  title: "Onion rice",
  proteinCategory: "meat-free",
  servings: 2,
  ingredients: [
    {
      id: "onion",
      name: "onion",
      quantity: "1",
      note: "finely chopped",
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [{ id: "fry", text: "Fry the onion." }],
};
async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "cook-owner",
      name: null,
      email: null,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { t, ownerId, user: t.withIdentity({ subject: "cook-owner" }) };
}

test("new personal recipes store links at creation; guests cannot create recipes", async () => {
  const { t, user } = await setup();
  await expect(
    t.mutation(api.recipes.create, { recipe: content }),
  ).rejects.toThrow();
  const id = await user.mutation(api.recipes.create, { recipe: content });
  const stored = await t.run((ctx) => ctx.db.get(id));
  expect(stored!.steps[0].ingredientMapping!.references).toMatchObject([
    { ingredientIds: ["onion"], status: "resolved" },
  ]);
});

test("older private snapshots get backend links, with an idempotent content-preserving backfill", async () => {
  const { t, user, ownerId } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("recipes", {
      ...content,
      ownerId,
      source: { type: "manual" },
      savedAt: 5,
      updatedAt: 6,
    }),
  );
  const before = await t.run((ctx) => ctx.db.get(id));
  const view = await user.query(api.recipes.getMine, { recipeId: id });
  expect(view!.steps[0].ingredientMapping!.references[0].ingredientIds).toEqual(
    ["onion"],
  );
  await expect(
    t.query(api.recipes.getMine, { recipeId: id }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
  expect(
    (
      await t.mutation(internal.recipes.backfillIngredientMappings, {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).updated,
  ).toBe(1);
  expect(
    (
      await t.mutation(internal.recipes.backfillIngredientMappings, {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).updated,
  ).toBe(0);
  const after = await t.run((ctx) => ctx.db.get(id));
  expect(after).toMatchObject({
    ownerId,
    ingredients: content.ingredients,
    savedAt: 5,
    updatedAt: 6,
    source: { type: "manual" },
  });
  expect(
    after!.steps.map(({ ingredientMapping: mapping, ...step }) => {
      expect(mapping).toBeDefined();
      return step;
    }),
  ).toEqual(before!.steps);
});

test("public catalogue enrichment preserves immutable revisions and stored cache remains optional", async () => {
  const { t } = await setup();
  const id = await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    return await ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: "onion-rice",
      version: 1,
      status: "published",
      slug: "onion-rice",
      position: 0,
      imageStorageId,
      createdAt: 1,
      publishedAt: 2,
    });
  });
  const before = await t.run((ctx) => ctx.db.get(id));
  const args = { catalogueMealId: "onion-rice", catalogueVersion: 1 };
  const initial = await t.query(api.catalogue.getMeal, args);
  expect(
    initial!.steps[0].ingredientMapping!.references[0].ingredientIds,
  ).toEqual(["onion"]);
  expect(
    (
      await t.mutation(internal.catalogue.backfillIngredientMappings, {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).updated,
  ).toBe(1);
  expect(
    (
      await t.mutation(internal.catalogue.backfillIngredientMappings, {
        paginationOpts: { cursor: null, numItems: 25 },
      })
    ).updated,
  ).toBe(0);
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before);
  expect(await t.query(api.catalogue.getMeal, args)).toEqual(initial);
  const cache = await t.run((ctx) =>
    ctx.db.query("catalogueIngredientMappings").collect(),
  );
  expect(cache).toHaveLength(1);
  const reads = vi.spyOn(ingredientMappings, "withStepIngredientMappings");
  try {
    await t.query(api.catalogue.getCurrent, {});
    expect(reads).toHaveBeenCalled();
    expect(
      reads.mock.calls.every(([recipe]) =>
        recipe.steps.every((step) => step.ingredientMapping !== undefined),
      ),
    ).toBe(true);
  } finally {
    reads.mockRestore();
  }
  await t.run((ctx) => ctx.db.patch(cache[0]._id, { steps: [] }));
  expect(await t.query(api.catalogue.getMeal, args)).toEqual(initial);
});

test("owner edits rebuild links after ingredient deletion and text changes", async () => {
  const { t, user, ownerId } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("recipes", {
      ...content,
      ownerId,
      source: {
        type: "import",
        method: "text",
        importedAt: 1,
        normalizationVersion: 1,
        contentFingerprint: "fixture",
      },
      savedAt: 1,
      updatedAt: 1,
    }),
  );
  const view = await user.query(api.recipes.getMine, { recipeId: id });
  const changed = {
    ...content,
    steps: view!.steps,
    ingredients: [
      {
        id: "garlic",
        name: "garlic",
        quantity: "2",
        shoppingCategory: "fruit_and_veg" as const,
      },
    ],
  };
  const result = await user.mutation(api.recipes.updateImported, {
    recipeId: id,
    recipe: changed,
  });
  expect(result!.steps[0].ingredientMapping!.references).toEqual([]);
});

test("backfill reconciles shopping quantities if a fixed method amount prevents scaling", async () => {
  const { t, ownerId, user } = await setup();
  await t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      ...content,
      ownerId,
      servingScaling: "safe",
      steps: [{ id: "fry", text: "Add 1 onion." }],
      source: { type: "manual" },
      updatedAt: 1,
    });
    const planId = await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-11-05",
      endDate: "2026-11-05",
      servings: 4,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("mealSlots", {
      ownerId,
      mealPlanId: planId,
      date: "2026-11-05",
      recipeId,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  await user.mutation(api.shoppingLists.ensureForCurrentPlan, {});
  const plan = await user.query(api.mealPlans.getCurrent, {});
  expect(plan!.mealSlots[0].servingScaling).toBe("source_only");
  const cook = await user.query(api.recipes.getMine, {
    recipeId: plan!.mealSlots[0].recipeId,
  });
  expect(cook!.servingScaling).toBe("source_only");
  const before = await user.query(api.shoppingLists.getCurrent, {});
  expect(before.status).toBe("ready");
  if (before.status !== "ready" || !before.list)
    throw new Error("Expected a shopping list");
  expect(before.list.items[0].sources[0].amount).toContain("1");
  // Simulate an already-materialised list from before the serving safeguard.
  await t.run(async (ctx) => {
    const item = await ctx.db.get(before.list!.items[0]._id);
    await ctx.db.patch(item!._id, {
      sources: item!.sources!.map((source) => ({ ...source, amount: "2" })),
    });
  });
  await user.mutation(api.shoppingLists.setItemChecked, {
    itemId: before.list.items[0]._id,
    checked: true,
  });
  await t.mutation(internal.recipes.backfillIngredientMappings, {
    paginationOpts: { cursor: null, numItems: 25 },
  });
  const after = await user.query(api.shoppingLists.getCurrent, {});
  if (after.status !== "ready" || !after.list)
    throw new Error("Expected a shopping list");
  expect(after.list.items[0].sources[0].amount).toContain("1");
  expect(after.list.items[0].checked).toBe(true);
});
