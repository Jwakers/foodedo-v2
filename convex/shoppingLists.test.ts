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
  expect(salt).toMatchObject({
    treatment: "staple",
    included: false,
    checked: false,
  });
  if (salt === undefined) return;
  await asUser.mutation(api.shoppingLists.setStapleIncluded, {
    itemId: salt._id,
    included: true,
  });
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
      expect.objectContaining({
        name: "salt",
        treatment: "staple",
        included: true,
        checked: true,
      }),
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

test("generic water is omitted and staples are optional per list", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "staples-user",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const recipeId = await ctx.db.insert("recipes", {
      ownerId,
      title: "Staple soup",
      ingredients: [
        {
          id: "water",
          name: "boiling water",
          shoppingCategory: "other",
          quantity: "500",
          unit: "ml",
        },
        {
          id: "oil",
          name: "vegetable oil",
          shoppingCategory: "pantry",
          quantity: "1",
          unit: "tbsp",
        },
        {
          id: "sparkling",
          name: "sparkling water",
          shoppingCategory: "pantry",
          quantity: "1",
          unit: "bottle",
        },
      ],
      steps: [{ id: "step", text: "Cook." }],
      proteinCategory: "meat-free",
      source: { type: "manual" },
      updatedAt: 1,
    });
    const mealPlanId = await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-10-05",
      endDate: "2026-10-11",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerId,
      date: "2026-10-05",
      recipeId,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const asUser = t.withIdentity({ subject: "staples-user" });
  const ensured = await asUser.mutation(
    api.shoppingLists.ensureForCurrentPlan,
    {},
  );
  expect(ensured.status).toBe("ready");
  if (ensured.status !== "ready") return;

  const before = await asUser.query(api.shoppingLists.getCurrent, {});
  expect(before.status).toBe("ready");
  if (before.status !== "ready" || before.list === null) return;
  expect(before.list.items.some((item) => item.name === "boiling water")).toBe(
    false,
  );
  expect(before.list.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "vegetable oil",
        treatment: "staple",
        included: false,
      }),
      expect.objectContaining({
        name: "sparkling water",
        treatment: "required",
        included: true,
      }),
    ]),
  );
  const oil = before.list.items.find((item) => item.name === "vegetable oil");
  expect(oil).toBeDefined();
  if (oil === undefined) return;
  await expect(
    asUser.mutation(api.shoppingLists.setItemChecked, {
      itemId: oil._id,
      checked: true,
    }),
  ).resolves.toEqual({ status: "not_found" });
  await expect(
    asUser.mutation(api.shoppingLists.addItem, {
      shoppingListId: ensured.shoppingListId,
      name: "water",
    }),
  ).resolves.toMatchObject({ status: "added" });
  const withManualWater = await asUser.query(api.shoppingLists.getCurrent, {});
  expect(withManualWater).toMatchObject({
    status: "ready",
    list: {
      items: expect.arrayContaining([
        expect.objectContaining({
          name: "water",
          origin: "manual",
          treatment: "required",
          included: true,
        }),
      ]),
    },
  });
  const beforeSummaries = await asUser.query(
    api.shoppingLists.getRecentSummaries,
    {},
  );
  expect(beforeSummaries[0]).toMatchObject({ itemCount: 2, checkedCount: 0 });

  await expect(
    asUser.mutation(api.shoppingLists.includeAllStaples, {
      shoppingListId: ensured.shoppingListId,
    }),
  ).resolves.toEqual({ status: "updated", count: 1 });
  const after = await asUser.query(api.shoppingLists.getCurrent, {});
  expect(after).toMatchObject({
    status: "ready",
    list: {
      items: expect.arrayContaining([
        expect.objectContaining({
          name: "vegetable oil",
          included: true,
        }),
      ]),
    },
  });
  const afterSummaries = await asUser.query(
    api.shoppingLists.getRecentSummaries,
    {},
  );
  expect(afterSummaries[0]).toMatchObject({ itemCount: 3, checkedCount: 0 });
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
        treatment: "required",
        included: true,
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
        treatment: "required",
        included: true,
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
