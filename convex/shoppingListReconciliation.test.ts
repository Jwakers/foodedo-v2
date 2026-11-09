import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../tests/convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { syncShoppingListForPlan } from "./lib/shoppingListSync";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

test("active shopping stays atomic and bounded history batches converge on the latest recipe edit", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const client = t.withIdentity({ subject: "editor" });
  const ownerId = await client.mutation(api.users.ensureCurrent, {});
  const content = {
    title: "Tomato rice",
    servings: 2,
    proteinCategory: "meat-free" as const,
    ingredients: [
      {
        id: "tomato",
        name: "tomatoes",
        quantity: "400",
        unit: "g",
        shoppingCategory: "fruit_and_veg" as const,
      },
    ],
    steps: [{ id: "cook", text: "Cook the tomatoes." }],
  };
  const recipeId = await t.run((ctx) =>
    ctx.db.insert("recipes", {
      ...content,
      ownerId,
      savedAt: 1,
      updatedAt: 1,
      source: { type: "import", method: "text", importedAt: 1 },
    }),
  );
  await t.run(async (ctx) => {
    for (let i = 0; i < 8; i++) {
      const planId = await ctx.db.insert("mealPlans", {
        ownerId,
        servings: 2,
        startDate: `2026-11-${10 + i}`,
        endDate: `2026-11-${10 + i}`,
        status: i === 7 ? "active" : "archived",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("mealSlots", {
        ownerId,
        recipeId,
        mealPlanId: planId,
        date: `2026-11-${10 + i}`,
        status: "planned",
        createdAt: 1,
        updatedAt: 1,
      });
      await syncShoppingListForPlan(ctx, ownerId, planId);
    }
    const items = await ctx.db.query("shoppingListItems").collect();
    for (const item of items) await ctx.db.patch(item._id, { checked: true });
  });
  const edit = (quantity: string) =>
    client.mutation(api.recipes.updateImported, {
      recipeId,
      recipe: {
        ...content,
        ingredients: [{ ...content.ingredients[0], quantity }],
      },
    });
  await edit("500");
  await edit("600");
  const before = await t.run((ctx) =>
    ctx.db.query("shoppingListItems").collect(),
  );
  expect(before.at(-1)?.sources?.[0].amount).toBe("600 g");
  expect(before.some((item) => item.sources?.[0].amount === "400 g")).toBe(
    true,
  );
  // Both workers read current content; the older edit never restores 500 g.
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const after = await t.run((ctx) =>
    ctx.db.query("shoppingListItems").collect(),
  );
  expect(after).toHaveLength(8);
  expect(
    after.every((item) => item.sources?.[0].amount === "600 g" && item.checked),
  ).toBe(true);
  // A worker delivered after account removal cannot recreate shopping data.
  await t.mutation(internal.users.deleteFromClerk, { authSubject: "editor" });
  await expect(
    t.mutation(internal.shoppingListReconciliation.reconcileRecipeHistory, {
      recipeId,
      cursor: null,
    }),
  ).resolves.toBeNull();
});
