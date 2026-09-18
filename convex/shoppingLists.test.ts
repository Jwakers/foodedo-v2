import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("one plan keeps one list and reconciles changed ingredients", async () => {
  const t = convexTest(schema, modules);
  const { planId, slotId, replacementRecipeId } = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "shopping-sync-user",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const originalRecipeId = await ctx.db.insert("recipes", {
      ownerId,
      title: "Chicken and salt",
      ingredients: [
        {
          id: "salt",
          name: "salt",
          shoppingCategory: "pantry",
          quantity: "1 tsp",
        },
        {
          id: "chicken",
          name: "chicken thighs",
          shoppingCategory: "meat_and_fish",
          quantity: "4",
        },
      ],
      steps: [{ id: "step", text: "Cook." }],
      proteinCategory: "chicken",
      source: { type: "manual" },
      updatedAt: 1,
    });
    const replacementRecipeId = await ctx.db.insert("recipes", {
      ownerId,
      title: "Carrots and salt",
      ingredients: [
        {
          id: "salt",
          name: "salt",
          shoppingCategory: "pantry",
          quantity: "1 tsp",
        },
        {
          id: "carrots",
          name: "carrots",
          shoppingCategory: "fruit_and_veg",
          quantity: "500 g",
        },
      ],
      steps: [{ id: "step", text: "Cook." }],
      proteinCategory: "meat-free",
      source: { type: "manual" },
      updatedAt: 1,
    });
    const planId = await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const slotId = await ctx.db.insert("mealSlots", {
      ownerId,
      mealPlanId: planId,
      date: "2026-09-14",
      recipeId: originalRecipeId,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    });
    return {
      planId,
      slotId,
      replacementRecipeId,
    };
  });
  const asUser = t.withIdentity({ subject: "shopping-sync-user" });

  const initial = await asUser.mutation(
    api.shoppingLists.ensureForCurrentPlan,
    {},
  );
  expect(initial.status).toBe("ready");
  if (initial.status !== "ready") return;

  const before = await asUser.query(api.shoppingLists.getCurrent, {});
  expect(before.status).toBe("ready");
  if (before.status !== "ready" || before.list === null) return;
  const salt = before.list.items.find((item) => item.name === "salt");
  expect(salt).toBeDefined();
  if (salt === undefined) return;
  await asUser.mutation(api.shoppingLists.setItemChecked, {
    itemId: salt._id,
    checked: true,
  });
  const manual = await asUser.mutation(api.shoppingLists.addItem, {
    shoppingListId: initial.shoppingListId,
    name: "oat milk",
  });
  expect(manual.status).toBe("added");

  await t.run(async (ctx) => {
    await ctx.db.patch(slotId, { recipeId: replacementRecipeId, updatedAt: 2 });
    await ctx.db.patch(planId, { updatedAt: 2 });
  });
  const reconciled = await asUser.mutation(
    api.shoppingLists.ensureForCurrentPlan,
    {},
  );
  expect(reconciled).toEqual({
    status: "ready",
    shoppingListId: initial.shoppingListId,
  });

  const after = await asUser.query(api.shoppingLists.getCurrent, {});
  expect(after.status).toBe("ready");
  if (after.status !== "ready" || after.list === null) return;
  expect(after.list.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "salt", checked: true }),
      expect.objectContaining({ name: "carrots", checked: false }),
      expect.objectContaining({ name: "oat milk", origin: "manual" }),
    ]),
  );
  expect(after.list.items.some((item) => item.name === "chicken thighs")).toBe(
    false,
  );
  expect(
    await t.run(async (ctx) =>
      ctx.db
        .query("shoppingLists")
        .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", planId))
        .collect(),
    ),
  ).toHaveLength(1);
});

test("recent lists are selectable and previous list checks remain editable", async () => {
  const t = convexTest(schema, modules);
  const { ownerId, activeListId, archivedListId, archivedItemId } = await t.run(
    async (ctx) => {
      const ownerId = await ctx.db.insert("users", {
        authSubject: "shopping-history-user",
        email: "shopping-history@example.com",
        name: "Shopping history user",
        createdAt: 1,
        updatedAt: 1,
      });
      const archivedPlanId = await ctx.db.insert("mealPlans", {
        ownerId,
        startDate: "2026-09-07",
        endDate: "2026-09-13",
        status: "archived",
        createdAt: 10,
        updatedAt: 10,
      });
      const activePlanId = await ctx.db.insert("mealPlans", {
        ownerId,
        startDate: "2026-09-14",
        endDate: "2026-09-20",
        status: "active",
        createdAt: 20,
        updatedAt: 20,
      });
      const archivedListId = await ctx.db.insert("shoppingLists", {
        ownerId,
        mealPlanId: archivedPlanId,
        mealPlanUpdatedAt: 10,
        status: "archived",
        createdAt: 11,
        updatedAt: 11,
      });
      const activeListId = await ctx.db.insert("shoppingLists", {
        ownerId,
        mealPlanId: activePlanId,
        mealPlanUpdatedAt: 20,
        status: "active",
        createdAt: 21,
        updatedAt: 21,
      });
      const archivedItemId = await ctx.db.insert("shoppingListItems", {
        shoppingListId: archivedListId,
        ownerId,
        name: "lemons",
        displayName: "2 lemons",
        category: "fruit_and_veg",
        detailLines: [],
        sourceRecipeIds: [],
        sources: [],
        origin: "derived",
        checked: false,
        order: 0,
        createdAt: 11,
        updatedAt: 11,
      });
      await ctx.db.insert("shoppingListItems", {
        shoppingListId: activeListId,
        ownerId,
        name: "bread",
        displayName: "1 loaf bread",
        category: "bakery",
        detailLines: [],
        sourceRecipeIds: [],
        sources: [],
        origin: "derived",
        checked: true,
        order: 0,
        createdAt: 21,
        updatedAt: 21,
      });
      return { ownerId, activeListId, archivedListId, archivedItemId };
    },
  );
  const asUser = t.withIdentity({ subject: "shopping-history-user" });

  const summaries = await asUser.query(
    api.shoppingLists.getRecentSummaries,
    {},
  );
  expect(summaries.map((list) => list._id)).toEqual([
    activeListId,
    archivedListId,
  ]);
  expect(summaries[0]).toMatchObject({
    status: "active",
    checkedCount: 1,
    itemCount: 1,
  });

  const archived = await asUser.query(api.shoppingLists.getById, {
    shoppingListId: archivedListId,
  });
  expect(archived).toMatchObject({
    status: "archived",
    startDate: "2026-09-07",
    endDate: "2026-09-13",
  });

  expect(
    await asUser.mutation(api.shoppingLists.setItemChecked, {
      itemId: archivedItemId,
      checked: true,
    }),
  ).toEqual({ status: "updated" });
  expect(
    await t.run(async (ctx) => (await ctx.db.get(archivedItemId))?.checked),
  ).toBe(true);
  expect(ownerId).toBeDefined();
});

test("shopping-list history does not expose another owner’s snapshot", async () => {
  const t = convexTest(schema, modules);
  const listId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      authSubject: "other-user",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const planId = await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      status: "archived",
      createdAt: 1,
      updatedAt: 1,
    });
    return await ctx.db.insert("shoppingLists", {
      ownerId,
      mealPlanId: planId,
      mealPlanUpdatedAt: 1,
      status: "archived",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  const otherUser = t.withIdentity({ subject: "other-user" });
  expect(
    await otherUser.query(api.shoppingLists.getById, {
      shoppingListId: listId,
    }),
  ).toBeNull();
});
