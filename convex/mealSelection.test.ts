import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { GUEST_DRAFT_SCHEMA_VERSION } from "../src/lib/domain/guest-draft";

const modules = import.meta.glob("./**/*.ts");
const dates = ["2026-11-01", "2026-11-02", "2026-11-03"];

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const users = await Promise.all(
      ["alice", "bob", "outsider"].map((authSubject) =>
        ctx.db.insert("users", {
          authSubject,
          email: null,
          name: authSubject,
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    );
    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    for (let i = 0; i < 12; i++)
      await ctx.db.insert("catalogueMeals", {
        catalogueMealId: `meal-${i}`,
        version: 1,
        status: "published",
        slug: `meal-${i}`,
        position: i,
        title: `Meal ${i}`,
        ingredients: [
          { id: "i", name: "beans", quantity: "1", shoppingCategory: "pantry" },
        ],
        steps: [{ id: "s", text: "Cook." }],
        proteinCategory: "meat-free",
        servings: 4,
        imageStorageId,
        createdAt: 1,
        publishedAt: 2,
      });
    return users;
  });
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const householdId = await alice.mutation(api.households.create, {});
  await alice.mutation(api.households.invite, {
    householdId,
    token: "a".repeat(64),
  });
  await bob.mutation(api.households.acceptInvite, { token: "a".repeat(64) });
  const claim = {
    householdId,
    expectedPlanId: null,
    claimKey: "selection_claim_123456",
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate: dates[0]!,
    servings: 4,
    mealChoices: dates.map((date, i) => ({
      date,
      catalogueMealId: `meal-${i}`,
      catalogueVersion: 1,
    })),
  };
  const save = (user: typeof alice, i: number) =>
    user.mutation(api.recipes.saveCatalogueMeal, {
      catalogueMealId: `meal-${i}`,
      catalogueVersion: 1,
    });
  return { t, alice, bob, outsider, ids, householdId, claim, save };
}

test("household signals include every current member once and keep private libraries private", async () => {
  const { t, alice, bob, outsider, householdId, save, ids } = await setup();
  await save(alice, 4);
  await save(bob, 4);
  await save(bob, 5);
  await save(outsider, 6);
  // Two revisions/copies of a saved meal are still one member's vote.
  await t.run(async (ctx) => {
    const saved = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_saved_at", (q) =>
        q.eq("ownerId", ids[1]!).gt("savedAt", 0),
      )
      .first();
    if (!saved) throw new Error("Missing fixture");
    const { _id, _creationTime, ...fields } = saved;
    void _id;
    void _creationTime;
    await ctx.db.insert("recipes", fields);
  });
  const privateRecipeId = await bob.mutation(api.recipes.create, {
    recipe: {
      title: "Secret recipe",
      ingredients: [
        { id: "i", name: "beans", quantity: "1", shoppingCategory: "pantry" },
      ],
      steps: [{ id: "s", text: "Cook." }],
      proteinCategory: "meat-free",
    },
  });
  const signals = await alice.query(
    api.mealPlans.getCatalogueSelectionSignals,
    { householdId },
  );
  expect(signals).toEqual(
    await bob.query(api.mealPlans.getCatalogueSelectionSignals, {
      householdId,
    }),
  );
  expect(
    signals.find((s) => s.catalogueMealId === "meal-4")?.savedByMemberKeys,
  ).toHaveLength(2);
  expect(
    signals.find((s) => s.catalogueMealId === "meal-5")?.savedByMemberKeys,
  ).toHaveLength(1);
  expect(signals.some((s) => s.catalogueMealId === "meal-6")).toBe(false);
  expect(JSON.stringify(signals)).not.toContain(privateRecipeId);
  expect(
    await alice.query(api.recipes.getMine, { recipeId: privateRecipeId }),
  ).toBeNull();
  expect(
    await outsider.query(api.mealPlans.getCatalogueSelectionSignals, {
      householdId,
    }),
  ).toEqual([]);
  expect(
    await alice.query(api.mealPlans.getCatalogueSelectionSignals, {}),
  ).toEqual([
    {
      catalogueMealId: "meal-4",
      isSaved: true,
      savedByMemberKeys: [],
      dismissalCount: 0,
    },
  ]);
  await bob.mutation(api.households.leave, { householdId });
  const after = await alice.query(api.mealPlans.getCatalogueSelectionSignals, {
    householdId,
  });
  expect(
    after.find((s) => s.catalogueMealId === "meal-4")?.savedByMemberKeys,
  ).toHaveLength(1);
  expect(after.some((s) => s.catalogueMealId === "meal-5")).toBe(false);
});

test("server proposals use partner favourites and are independent of the acting member", async () => {
  const { t, alice, bob, householdId, claim, save } = await setup();
  await save(bob, 9);
  await alice.mutation(api.mealPlans.claimGuestDraft, claim);
  const args = { householdId, fromDate: dates[0]!, variant: 1 };
  const proposal = await alice.query(
    api.mealPlans.getRegenerationProposal,
    args,
  );
  expect(proposal).toEqual(
    await bob.query(api.mealPlans.getRegenerationProposal, args),
  );
  if (proposal.status !== "ready") throw new Error("Missing proposal");
  expect(proposal.mealSlots[0]?.catalogueMealId).toBe("meal-9");
  // Merely viewing alternatives never writes a rejection.
  expect(
    (
      await t.run((ctx) => ctx.db.query("mealSelectionFeedback").collect())
    ).every((row) => row.outcome === "kept"),
  ).toBe(true);
});

test("partial replans and extensions balance favourites against meals being retained", async () => {
  const { alice, bob, householdId, claim, save } = await setup();
  for (const meal of [0, 1, 2, 8]) await save(alice, meal);
  await save(bob, 9);
  await alice.mutation(api.mealPlans.claimGuestDraft, claim);
  for (let variant = 1; variant <= 10; variant++) {
    const proposal = await alice.query(api.mealPlans.getRegenerationProposal, {
      householdId,
      fromDate: dates[2]!,
      variant,
    });
    if (proposal.status !== "ready") throw new Error("Missing proposal");
    expect(proposal.mealSlots[0]?.catalogueMealId).toBe("meal-0");
    expect(proposal.mealSlots[1]?.catalogueMealId).toBe("meal-1");
    expect(proposal.mealSlots[2]?.catalogueMealId).toBe("meal-9");
  }
  const before = await alice.query(api.mealPlans.getCurrent, { householdId });
  await alice.mutation(api.mealPlans.adjustActivePlan, {
    householdId,
    mealPlanId: before!._id,
    expectedUpdatedAt: before!.updatedAt,
    planDays: 4,
    startDate: dates[0]!,
    servings: 4,
    persistForFuture: false,
  });
  const extended = await alice.query(api.mealPlans.getCurrent, { householdId });
  expect(extended!.mealSlots[3]?.catalogueMealId).toBe("meal-9");
});

test("individual replacement, swap-back, stale retries and removal record contextual outcomes", async () => {
  const { t, alice, bob, outsider, householdId, claim } = await setup();
  await alice.mutation(api.mealPlans.claimGuestDraft, claim);
  const original = await alice.query(api.mealPlans.getCurrent, { householdId });
  if (!original) throw new Error("Missing plan");
  const replace = {
    householdId,
    mealPlanId: original._id,
    expectedUpdatedAt: original.updatedAt,
    date: dates[0]!,
    catalogueMealId: "meal-8",
    catalogueVersion: 1,
  };
  expect((await bob.mutation(api.mealPlans.planMeal, replace)).status).toBe(
    "planned",
  );
  expect((await alice.mutation(api.mealPlans.planMeal, replace)).status).toBe(
    "plan_changed",
  );
  let rows = await t.run((ctx) =>
    ctx.db.query("mealSelectionFeedback").collect(),
  );
  expect(rows.filter((r) => r.outcome === "dismissed")).toHaveLength(1);
  expect(rows.find((r) => r.candidateKey === "catalogue:meal-0")?.outcome).toBe(
    "dismissed",
  );
  expect(
    (
      await alice.query(api.mealPlans.getCatalogueSelectionSignals, {
        householdId,
      })
    ).find((s) => s.catalogueMealId === "meal-0")?.dismissalCount,
  ).toBe(1);
  const changed = await alice.query(api.mealPlans.getCurrent, { householdId });
  await alice.mutation(api.mealPlans.planMeal, {
    ...replace,
    expectedUpdatedAt: changed!.updatedAt,
    catalogueMealId: "meal-0",
  });
  rows = await t.run((ctx) => ctx.db.query("mealSelectionFeedback").collect());
  expect(rows.find((r) => r.candidateKey === "catalogue:meal-0")?.outcome).toBe(
    "kept",
  );
  const restored = await alice.query(api.mealPlans.getCurrent, { householdId });
  const remove = {
    householdId,
    mealPlanId: restored!._id,
    expectedUpdatedAt: restored!.updatedAt,
    date: dates[1]!,
  };
  await expect(
    outsider.mutation(api.mealPlans.removeMeal, remove),
  ).rejects.toThrow();
  expect((await bob.mutation(api.mealPlans.removeMeal, remove)).status).toBe(
    "removed",
  );
  expect((await bob.mutation(api.mealPlans.removeMeal, remove)).status).toBe(
    "plan_changed",
  );
  expect(
    (
      await t.run((ctx) => ctx.db.query("mealSelectionFeedback").collect())
    ).filter((r) => r.outcome === "dismissed"),
  ).toHaveLength(2);
  // Feedback in Household does not affect the private planner.
  expect(
    await bob.query(api.mealPlans.getCatalogueSelectionSignals, {}),
  ).toEqual([]);
});

test("claiming draft feedback is idempotent, accepts kept meals and deletes personal attribution", async () => {
  const { t, alice, householdId, claim } = await setup();
  const args = {
    ...claim,
    dismissedMeals: [
      { date: dates[0]!, catalogueMealId: "meal-9" },
      { date: dates[0]!, catalogueMealId: "meal-9" },
      { date: dates[1]!, catalogueMealId: "meal-1" },
    ],
  };
  expect(
    (await alice.mutation(api.mealPlans.claimGuestDraft, args)).status,
  ).toBe("claimed");
  expect(
    (await alice.mutation(api.mealPlans.claimGuestDraft, args)).status,
  ).toBe("already_claimed");
  const rows = await t.run((ctx) =>
    ctx.db.query("mealSelectionFeedback").collect(),
  );
  expect(rows).toHaveLength(4);
  expect(rows.filter((r) => r.outcome === "kept")).toHaveLength(3);
  expect(rows.filter((r) => r.outcome === "dismissed")).toHaveLength(1);
  await t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" });
  expect(
    await t.run((ctx) => ctx.db.query("mealSelectionFeedback").collect()),
  ).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(householdId))).not.toBeNull();
});

test("automatic swaps use partner favourites and record a rejection only after a successful edit", async () => {
  const { t, alice, bob, householdId, claim, save } = await setup();
  await alice.mutation(api.mealPlans.claimGuestDraft, claim);
  await save(bob, 9);
  const before = await alice.query(api.mealPlans.getCurrent, { householdId });
  const slot = before!.mealSlots[0]!;
  const args = {
    householdId,
    mealSlotId: slot._id,
    expectedUpdatedAt: before!.updatedAt,
  };
  expect((await alice.mutation(api.mealPlans.swapMeal, args)).status).toBe(
    "swapped",
  );
  const after = await alice.query(api.mealPlans.getCurrent, { householdId });
  expect(after!.mealSlots[0]!.catalogueMealId).toBe("meal-9");
  expect((await bob.mutation(api.mealPlans.swapMeal, args)).status).toBe(
    "plan_unavailable",
  );
  const rows = await t.run((ctx) =>
    ctx.db.query("mealSelectionFeedback").collect(),
  );
  expect(rows.filter((r) => r.outcome === "dismissed")).toHaveLength(1);
  expect(rows.find((r) => r.candidateKey === "catalogue:meal-0")?.outcome).toBe(
    "dismissed",
  );
});

test("feedback memory is bounded and shortening a plan is not a meal rejection", async () => {
  const { t, alice, householdId, claim, ids } = await setup();
  await alice.mutation(api.mealPlans.claimGuestDraft, claim);
  const plan = await alice.query(api.mealPlans.getCurrent, { householdId });
  await t.run(async (ctx) => {
    await ctx.db.insert("mealSelectionFeedback", {
      ownerId: householdId,
      actorId: ids[0]!,
      mealPlanId: plan!._id,
      date: dates[0]!,
      candidateKey: "catalogue:meal-9",
      outcome: "dismissed",
      updatedAt: 0,
    });
    for (let i = 0; i < 200; i++)
      await ctx.db.insert("mealSelectionFeedback", {
        ownerId: householdId,
        actorId: ids[0]!,
        mealPlanId: plan!._id,
        date: dates[0]!,
        candidateKey: `catalogue:kept-${i}`,
        outcome: "kept",
        updatedAt: 100 + i,
      });
  });
  const signals = await alice.query(
    api.mealPlans.getCatalogueSelectionSignals,
    { householdId },
  );
  expect(signals.some((s) => s.catalogueMealId === "meal-9")).toBe(false);
  // Extending then shortening only expresses calendar availability.
  await alice.mutation(api.mealPlans.adjustActivePlan, {
    householdId,
    mealPlanId: plan!._id,
    expectedUpdatedAt: plan!.updatedAt,
    planDays: 4,
    startDate: dates[0]!,
    servings: 4,
    persistForFuture: false,
  });
  const extended = await alice.query(api.mealPlans.getCurrent, { householdId });
  await alice.mutation(api.mealPlans.adjustActivePlan, {
    householdId,
    mealPlanId: plan!._id,
    expectedUpdatedAt: extended!.updatedAt,
    planDays: 3,
    startDate: dates[0]!,
    servings: 4,
    persistForFuture: false,
  });
  expect(
    (
      await t.run((ctx) => ctx.db.query("mealSelectionFeedback").collect())
    ).filter((r) => r.outcome === "dismissed"),
  ).toHaveLength(1);
});
