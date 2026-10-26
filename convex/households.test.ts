import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { GUEST_DRAFT_SCHEMA_VERSION } from "../src/lib/domain/guest-draft";

const modules = import.meta.glob("./**/*.ts");
const token = "a".repeat(64);
async function setup() {
  const t = convexTest(schema, modules);
  const [a, b, c] = await t.run(async (ctx) =>
    Promise.all(
      ["alice", "bob", "chris"].map((authSubject) =>
        ctx.db.insert("users", {
          authSubject,
          name: authSubject,
          email: `${authSubject}@example.com`,
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    ),
  );
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const chris = t.withIdentity({ subject: "chris" });
  const privateRecipeId = await alice.mutation(api.recipes.create, {
    recipe: {
      title: "Private dinner",
      ingredients: [
        {
          id: "i",
          name: "parsley",
          quantity: "1",
          unit: "bunch",
          shoppingCategory: "fruit_and_veg",
        },
      ],
      steps: [{ id: "s", text: "Cook dinner." }],
      proteinCategory: "meat-free",
      servings: 4,
    },
  });
  const planId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("mealPlans", {
      ownerId: a!,
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      servings: 4,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("mealSlots", {
      ownerId: a!,
      mealPlanId: id,
      recipeId: privateRecipeId,
      date: "2026-11-01",
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    });
    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    for (let i = 0; i < 8; i++)
      await ctx.db.insert("catalogueMeals", {
        catalogueMealId: `meal-${i}`,
        version: 1,
        slug: `meal-${i}`,
        position: i,
        status: "published",
        title: `Meal ${i}`,
        imageStorageId,
        publishedAt: 2,
        ingredients: [
          {
            id: "i",
            name: "parsley",
            quantity: "1",
            shoppingCategory: "fruit_and_veg",
          },
        ],
        steps: [{ id: "s", text: "Cook." }],
        proteinCategory: "meat-free",
        servings: 4,
        createdAt: 1,
      });
    return id;
  });
  await alice.mutation(api.shoppingLists.ensureForCurrentPlan, {});
  const privateList = await alice.query(api.shoppingLists.getCurrent, {});
  if (privateList.status !== "ready" || !privateList.list)
    throw new Error("Fixture list missing");
  await alice.mutation(api.shoppingLists.setItemChecked, {
    itemId: privateList.list.items[0]!._id,
    checked: true,
  });
  await alice.mutation(api.shoppingLists.addItem, {
    shoppingListId: privateList.list._id,
    name: "Milk for breakfast",
  });
  return {
    t,
    a: a!,
    b: b!,
    c: c!,
    alice,
    bob,
    chris,
    privateRecipeId,
    planId,
    privateList: privateList.list,
  };
}

test("creation copies only the current private week, snapshots and complete shopping state", async () => {
  const { t, alice, bob, privateRecipeId, planId, privateList } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  expect(await alice.mutation(api.households.create, {})).toBe(householdId);
  const shared = await alice.query(api.mealPlans.getCurrent, { householdId });
  expect(shared?._id).not.toBe(planId);
  expect(shared?.mealSlots[0]?.recipeId).not.toBe(privateRecipeId);
  expect((await alice.query(api.mealPlans.getCurrent, {}))?._id).toBe(planId);
  const shop = await alice.query(api.shoppingLists.getCurrent, { householdId });
  if (shop.status !== "ready" || !shop.list || !shared)
    throw new Error("Missing copied content");
  expect(shop.list.items.map((i) => [i.name, i.checked])).toEqual([
    ["parsley", true],
    ["Milk for breakfast", false],
  ]);
  expect(shop.list.items[0]?.sources[0]?.recipeId).toBe(
    shared.mealSlots[0]?.recipeId,
  );
  expect(
    await bob.query(api.recipes.getMine, {
      recipeId: shared.mealSlots[0]!.recipeId,
    }),
  ).toBeNull();
  expect(await bob.query(api.mealPlans.getCurrent, { householdId })).toBeNull();
  await alice.mutation(api.households.invite, { householdId, token });
  await bob.mutation(api.households.acceptInvite, { token });
  expect(await bob.query(api.mealPlans.getCurrent, { householdId })).toEqual(
    shared,
  );
  expect(
    await bob.query(api.recipes.getMine, { recipeId: privateRecipeId }),
  ).toBeNull();
  expect(
    (
      await bob.query(api.recipes.getMine, {
        recipeId: shared.mealSlots[0]!.recipeId,
      })
    )?.householdSnapshot,
  ).toBe(true);
  await bob.mutation(api.shoppingLists.setItemChecked, {
    householdId,
    itemId: shop.list.items[0]!._id,
    checked: false,
  });
  expect(
    (
      await alice.query(api.shoppingLists.getById, {
        shoppingListId: privateList._id,
      })
    )?.items[0]?.checked,
  ).toBe(true);
  const foreignChange = await bob.mutation(api.shoppingLists.removeItem, {
    householdId,
    itemId: privateList.items[0]!._id,
  });
  expect(foreignChange.status).toBe("not_found");
  const snapshots = await t.run((ctx) =>
    ctx.db
      .query("recipes")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", householdId))
      .collect(),
  );
  expect(snapshots[0]?.savedAt).toBeUndefined();
});

test("creation reconciles stale shopping sources without changing the private list", async () => {
  const { t, alice, a, privateList } = await setup();
  await t.run(async (ctx) => {
    const recipe = await ctx.db.insert("recipes", {
      ownerId: a,
      title: "No longer planned",
      proteinCategory: "meat-free",
      ingredients: [
        {
          id: "i",
          name: "obsolete ingredient",
          quantity: "1",
          shoppingCategory: "other",
        },
      ],
      steps: [{ id: "s", text: "Cook." }],
      source: { type: "manual" },
      updatedAt: 1,
    });
    const original = await ctx.db.get(privateList.items[0]!._id);
    if (!original) throw new Error("Missing fixture item");
    const { _id, _creationTime, ...item } = original;
    void _id;
    void _creationTime;
    await ctx.db.insert("shoppingListItems", {
      ...item,
      name: "obsolete ingredient",
      displayName: "obsolete ingredient",
      order: 2,
      sourceRecipeIds: [recipe],
      sources: [{ ...original.sources![0]!, recipeId: recipe }],
    });
  });
  const householdId = await alice.mutation(api.households.create, {});
  const shared = await alice.query(api.shoppingLists.getCurrent, {
    householdId,
  });
  if (shared.status !== "ready" || !shared.list)
    throw new Error("Missing shared list");
  expect(shared.list.items.map((item) => item.name)).not.toContain(
    "obsolete ingredient",
  );
  expect(
    shared.list.items.find((item) => item.name === "parsley")?.checked,
  ).toBe(true);
  expect(
    shared.list.items.find((item) => item.name === "Milk for breakfast"),
  ).toBeDefined();
  const original = await alice.query(api.shoppingLists.getById, {
    shoppingListId: privateList._id,
  });
  expect(original?.items.map((item) => item.name)).toContain(
    "obsolete ingredient",
  );
});

test("invite reuse, explicit acceptance, cancellation, expiry and one-household boundary", async () => {
  const { t, alice, bob, chris } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  const created = await alice.mutation(api.households.invite, {
    householdId,
    token,
  });
  expect(
    await alice.mutation(api.households.invite, {
      householdId,
      token: "b".repeat(64),
    }),
  ).toEqual(created);
  expect(
    (await t.query(api.households.previewInvite, { token, now: Date.now() }))
      .status,
  ).toBe("ready");
  expect(await bob.query(api.households.current, {})).toBeNull();
  await alice.mutation(api.households.cancelInvite, { householdId, token });
  await expect(
    bob.mutation(api.households.acceptInvite, { token }),
  ).rejects.toThrow();
  expect(
    (await t.query(api.households.previewInvite, { token, now: Date.now() }))
      .status,
  ).toBe("cancelled");
  const next = "b".repeat(64);
  await alice.mutation(api.households.invite, {
    householdId,
    token: next,
    replaceCancelled: true,
  });
  expect(await bob.mutation(api.households.acceptInvite, { token: next })).toBe(
    householdId,
  );
  expect(await bob.mutation(api.households.acceptInvite, { token: next })).toBe(
    householdId,
  );
  await expect(
    chris.mutation(api.households.acceptInvite, { token: next }),
  ).rejects.toThrow();
  expect(
    (
      await bob.query(api.households.previewInvite, {
        token: next,
        now: Date.now(),
      })
    ).status,
  ).toBe("ready");
  const thirdHousehold = await chris.mutation(api.households.create, {});
  const thirdToken = "c".repeat(64);
  await chris.mutation(api.households.invite, {
    householdId: thirdHousehold,
    token: thirdToken,
  });
  await expect(
    bob.mutation(api.households.acceptInvite, { token: thirdToken }),
  ).rejects.toThrow("Leave your current household");
  const invite = await t.run((ctx) =>
    ctx.db
      .query("householdInvites")
      .withIndex("by_token", (q) => q.eq("token", thirdToken))
      .unique(),
  );
  await t.run((ctx) => ctx.db.patch(invite!._id, { expiresAt: 1 }));
  await expect(
    alice.mutation(api.households.acceptInvite, { token: thirdToken }),
  ).rejects.toThrow();
  expect(
    (
      await t.query(api.households.previewInvite, {
        token: thirdToken,
        now: Date.now(),
      })
    ).status,
  ).toBe("expired");
});

test("creator departure and account deletion preserve shared content; final departure closes without copying", async () => {
  const { t, alice, bob, planId } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  await alice.mutation(api.households.invite, { householdId, token });
  await bob.mutation(api.households.acceptInvite, { token });
  const shared = await bob.query(api.mealPlans.getCurrent, { householdId });
  await t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" });
  expect(
    (await bob.query(api.mealPlans.getCurrent, { householdId }))?._id,
  ).toBe(shared?._id);
  expect(
    await bob.query(api.recipes.getMine, {
      recipeId: shared!.mealSlots[0]!.recipeId,
    }),
  ).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(planId))).toBeNull();
  await bob.mutation(api.households.leave, { householdId });
  expect(await bob.query(api.households.current, {})).toBeNull();
  expect(await bob.query(api.mealPlans.getCurrent, {})).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(shared!._id))).not.toBeNull();
  expect((await t.run((ctx) => ctx.db.get(householdId)))?.closedAt).toBeTypeOf(
    "number",
  );
  expect(await bob.query(api.mealPlans.getCurrent, { householdId })).toBeNull();
  expect(
    await bob.query(api.recipes.getMine, {
      recipeId: shared!.mealSlots[0]!.recipeId,
    }),
  ).toBeNull();
});

test("shared review rejects stale writes and preserves shopping state on replacement; former members cannot mutate or undo", async () => {
  const { alice, bob } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  await alice.mutation(api.households.invite, { householdId, token });
  await bob.mutation(api.households.acceptInvite, { token });
  const proposal = await alice.query(api.mealPlans.getRegenerationProposal, {
    householdId,
    variant: 1,
  });
  if (proposal.status !== "ready") throw new Error("No review");
  await bob.mutation(api.mealPlans.adjustActivePlan, {
    householdId,
    mealPlanId: proposal.sourcePlanId,
    expectedUpdatedAt: proposal.sourceUpdatedAt,
    planDays: 3,
    startDate: "2026-11-01",
    servings: 3,
    persistForFuture: true,
  });
  expect(
    (
      await alice.mutation(api.mealPlans.applyRegenerationProposal, {
        householdId,
        sourcePlanId: proposal.sourcePlanId,
        sourceUpdatedAt: proposal.sourceUpdatedAt,
        variant: 1,
      })
    ).status,
  ).toBe("plan_changed");
  await expect(
    alice.mutation(api.mealPlans.claimGuestDraft, {
      householdId,
      expectedPlanId: proposal.sourcePlanId,
      expectedUpdatedAt: proposal.sourceUpdatedAt,
      claimKey: "review_source_123456789",
      schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
      planStartDate: "2026-11-01",
      servings: 4,
      mealChoices: [1, 2, 3].map((day, i) => ({
        date: `2026-11-0${day}`,
        catalogueMealId: `meal-${i}`,
        catalogueVersion: 1,
      })),
    }),
  ).rejects.toThrow();
  const latest = await alice.query(api.mealPlans.getRegenerationProposal, {
    householdId,
    variant: 1,
  });
  if (latest.status !== "ready") throw new Error("No review");
  const result = await alice.mutation(api.mealPlans.applyRegenerationProposal, {
    householdId,
    sourcePlanId: latest.sourcePlanId,
    sourceUpdatedAt: latest.sourceUpdatedAt,
    variant: 1,
  });
  expect(result.status).toBe("applied");
  const shop = await alice.query(api.shoppingLists.getCurrent, { householdId });
  if (shop.status !== "ready" || !shop.list) throw new Error("No shopping");
  expect(shop.list.items.find((i) => i.name === "parsley")?.checked).toBe(true);
  expect(
    shop.list.items.find((i) => i.name === "Milk for breakfast"),
  ).toBeDefined();
  await bob.mutation(api.households.leave, { householdId });
  await expect(
    bob.mutation(api.shoppingLists.removeItem, {
      householdId,
      itemId: shop.list.items[0]!._id,
    }),
  ).rejects.toThrow();
  if (result.status !== "applied") throw new Error("Not applied");
  await expect(
    bob.mutation(api.mealPlans.undoPlanReplacement, {
      householdId,
      currentMealPlanId: result.mealPlanId,
      previousMealPlanId: result.previousMealPlanId,
      currentUpdatedAt: result.currentUpdatedAt,
    }),
  ).rejects.toThrow();
});

test("expired invitations cannot be accepted even with a fabricated preview clock", async () => {
  const { alice, bob } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  await alice.mutation(api.households.invite, { householdId, token });
  vi.useFakeTimers();
  try {
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    await expect(
      bob.mutation(api.households.acceptInvite, { token }),
    ).rejects.toThrow();
  } finally {
    vi.useRealTimers();
  }
});

test("shared single-meal edits are collaborative, revision guarded, and never touch Private", async () => {
  const { alice, bob, planId } = await setup();
  const householdId = await alice.mutation(api.households.create, {});
  await alice.mutation(api.households.invite, { householdId, token });
  await bob.mutation(api.households.acceptInvite, { token });
  const original = await bob.query(api.mealPlans.getCurrent, { householdId });
  if (!original) throw new Error("No week");
  expect(
    (
      await bob.mutation(api.mealPlans.planMeal, {
        householdId,
        mealPlanId: original._id,
        expectedUpdatedAt: original.updatedAt,
        date: "2026-11-02",
        catalogueMealId: "meal-1",
        catalogueVersion: 1,
      })
    ).status,
  ).toBe("planned");
  expect(
    (
      await alice.mutation(api.mealPlans.removeMeal, {
        householdId,
        mealPlanId: original._id,
        expectedUpdatedAt: original.updatedAt,
        date: "2026-11-01",
      })
    ).status,
  ).toBe("plan_changed");
  const updated = await alice.query(api.mealPlans.getCurrent, { householdId });
  expect(updated?.mealSlots).toHaveLength(2);
  expect((await alice.query(api.mealPlans.getCurrent, {}))?._id).toBe(planId);
  expect(
    (await alice.query(api.mealPlans.getCurrent, {}))?.mealSlots,
  ).toHaveLength(1);
  if (!updated) throw new Error("No week");
  expect(
    (
      await alice.mutation(api.mealPlans.swapMeal, {
        householdId,
        mealSlotId: updated.mealSlots[0]!._id,
        expectedUpdatedAt: original.updatedAt,
      })
    ).status,
  ).toBe("plan_unavailable");
  expect(
    (
      await alice.mutation(api.mealPlans.removeMeal, {
        householdId,
        mealPlanId: updated._id,
        expectedUpdatedAt: updated.updatedAt,
        date: "2026-11-02",
      })
    ).status,
  ).toBe("removed");
  const after = await bob.query(api.mealPlans.getCurrent, { householdId });
  expect(
    (
      await bob.mutation(api.mealPlans.removeMeal, {
        householdId,
        mealPlanId: after!._id,
        expectedUpdatedAt: after!.updatedAt,
        date: "2026-11-01",
      })
    ).status,
  ).toBe("last_meal");
});
