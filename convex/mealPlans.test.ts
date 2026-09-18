import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
} from "../src/lib/domain/guest-draft";

const modules = import.meta.glob("./**/*.ts");
const authSubject = "test-user";
const planStartDate = "2026-09-21";
const claimKey = "claim_key_123456789";
const catalogueVersion = 2;
const catalogueMealIds = Array.from(
  { length: 12 },
  (_, index) => `catalogue-meal-${index + 1}`,
);

function createTestContext() {
  return convexTest(schema, modules);
}

async function authenticateTestUser(
  t: ReturnType<typeof createTestContext>,
  subject = authSubject,
) {
  await seedCatalogue(t);
  const ownerId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
      name: "Test user",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return {
    ownerId,
    asUser: t.withIdentity({ subject }),
  };
}

async function seedCatalogue(t: ReturnType<typeof createTestContext>) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_meal_id_and_version", (q) =>
        q
          .eq("catalogueMealId", catalogueMealIds[0]!)
          .eq("version", catalogueVersion),
      )
      .unique();
    if (existing !== null) return;

    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    for (const [position, catalogueMealId] of catalogueMealIds.entries()) {
      await ctx.db.insert("catalogueMeals", {
        catalogueMealId,
        version: catalogueVersion,
        status: "published",
        slug: catalogueMealId,
        position,
        title: `Catalogue meal ${position + 1}`,
        description: "A synthetic catalogue recipe for Convex tests.",
        ingredients: [
          {
            id: "ingredient-1",
            name: "ingredient",
            shoppingCategory: "pantry",
            quantity: "1",
          },
        ],
        steps: [{ id: "step-1", text: "Cook the ingredient." }],
        servings: 4,
        prepMinutes: 5,
        cookMinutes: 10,
        proteinCategory: "meat-free",
        costBand: "budget",
        imageStorageId,
        createdAt: 1,
        publishedAt: 2,
      });
    }
  });
}

function guestMealChoices(planDays = 7) {
  const mealIds = catalogueMealIds.slice(0, 5);
  return Array.from({ length: planDays }, (_, index) => ({
    date: addDaysToPlanDate(planStartDate, index),
    catalogueMealId:
      index === 2 || index === 5
        ? null
        : (mealIds[index % mealIds.length] ?? null),
    catalogueVersion: index === 2 || index === 5 ? null : catalogueVersion,
  }));
}

test("claim is idempotent, archives the prior plan, and preserves free days", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await authenticateTestUser(t);
  const priorPlanId = await t.run(async (ctx) => {
    return await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const args = {
    claimKey,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices(),
  };

  const first = await asUser.mutation(api.mealPlans.claimGuestDraft, args);
  expect(first.status).toBe("claimed");

  const savedState = await t.run(async (ctx) => {
    const plans = await ctx.db.query("mealPlans").collect();
    const slots = await ctx.db.query("mealSlots").collect();
    const claims = await ctx.db.query("guestClaims").collect();
    return { plans, slots, claims };
  });
  expect(
    savedState.plans.find((plan) => plan._id === priorPlanId)?.status,
  ).toBe("archived");
  expect(
    savedState.plans.filter((plan) => plan.status === "active"),
  ).toHaveLength(1);
  expect(savedState.slots).toHaveLength(5);
  expect(savedState.slots.map((slot) => slot.date)).not.toContain(
    addDaysToPlanDate(planStartDate, 2),
  );
  expect(savedState.slots.map((slot) => slot.date)).not.toContain(
    addDaysToPlanDate(planStartDate, 5),
  );
  expect(savedState.claims).toHaveLength(1);

  const retry = await asUser.mutation(api.mealPlans.claimGuestDraft, args);
  expect(retry).toEqual({
    status: "already_claimed",
    mealPlanId: first.mealPlanId,
  });
  const countsAfterRetry = await t.run(async (ctx) => ({
    plans: (await ctx.db.query("mealPlans").collect()).length,
    slots: (await ctx.db.query("mealSlots").collect()).length,
    claims: (await ctx.db.query("guestClaims").collect()).length,
  }));
  expect(countsAfterRetry).toEqual({ plans: 2, slots: 5, claims: 1 });
});

test("an unsupported catalogue leaves the existing active plan untouched", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await authenticateTestUser(t);
  const priorPlanId = await t.run(async (ctx) => {
    return await ctx.db.insert("mealPlans", {
      ownerId,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  const result = await asUser.mutation(api.mealPlans.claimGuestDraft, {
    claimKey: "unsupported_claim_12345",
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices().map((choice) =>
      choice.catalogueMealId === null
        ? choice
        : { ...choice, catalogueVersion: catalogueVersion + 1 },
    ),
  });
  expect(result).toEqual({ status: "catalogue_unsupported" });

  const state = await t.run(async (ctx) => ({
    plan: await ctx.db.get(priorPlanId),
    claims: await ctx.db.query("guestClaims").collect(),
  }));
  expect(state.plan?.status).toBe("active");
  expect(state.claims).toHaveLength(0);
});

test("claiming a guest plan requires an authenticated identity", async () => {
  const t = createTestContext();

  await expect(
    t.mutation(api.mealPlans.claimGuestDraft, {
      claimKey,
      schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
      planStartDate,
      servings: 4,
      mealChoices: guestMealChoices(),
    }),
  ).rejects.toThrow("Sign in to access personal Foodedo data.");
});

test("claims an intermediate six-day draft created during plan review", async () => {
  const t = createTestContext();
  const { asUser } = await authenticateTestUser(t);

  const result = await asUser.mutation(api.mealPlans.claimGuestDraft, {
    claimKey,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices(6),
  });
  expect(result.status).toBe("claimed");

  const plan = await asUser.query(api.mealPlans.getCurrent, {});
  expect(plan).toMatchObject({
    startDate: planStartDate,
    endDate: "2026-09-26",
  });
});

test("personal data requires a synced users document", async () => {
  const t = createTestContext();
  const asUser = t.withIdentity({ subject: "not-synced" });

  await expect(asUser.query(api.mealPlans.getCurrent, {})).rejects.toThrow(
    "Your Foodedo account is still being prepared.",
  );
});

test("a signed-in user cannot read another user's active plan", async () => {
  const t = createTestContext();
  const { asUser: owner } = await authenticateTestUser(t, "plan-owner");
  const { asUser: otherUser } = await authenticateTestUser(t, "other-user");

  await owner.mutation(api.mealPlans.claimGuestDraft, {
    claimKey,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices(),
  });

  expect(await otherUser.query(api.mealPlans.getCurrent, {})).toBeNull();
});

test("active adjustment rebases and trims without replacing preserved meals", async () => {
  const t = createTestContext();
  const { asUser } = await authenticateTestUser(t);
  await asUser.mutation(api.planningPreferences.updateUsual, {
    usualPlanDays: 7,
    usualServings: 4,
    prioritiseSavedRecipes: false,
  });
  await asUser.mutation(api.mealPlans.claimGuestDraft, {
    claimKey,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices(),
  });
  const before = await asUser.query(api.mealPlans.getCurrent, {});
  expect(before).not.toBeNull();

  const nextStartDate = "2026-10-05";
  const result = await asUser.mutation(api.mealPlans.adjustActivePlan, {
    mealPlanId: before!._id,
    expectedUpdatedAt: before!.updatedAt,
    planDays: 5,
    startDate: nextStartDate,
    servings: 2,
    persistForFuture: true,
  });
  expect(result).toEqual({
    status: "adjusted",
    addedDays: 0,
    removedDates: ["2026-09-26", "2026-09-27"],
  });

  const after = await asUser.query(api.mealPlans.getCurrent, {});
  expect(after).toMatchObject({
    _id: before!._id,
    startDate: nextStartDate,
    endDate: "2026-10-09",
    servings: 2,
  });
  const preservedBefore = before!.mealSlots;
  expect(after!.mealSlots.map((slot) => slot._id).toSorted()).toEqual(
    preservedBefore.map((slot) => slot._id).toSorted(),
  );
  expect(after!.mealSlots.map((slot) => slot.date)).toEqual([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
  ]);
  expect(after!.mealSlots.map((slot) => slot.recipeId).toSorted()).toEqual(
    preservedBefore.map((slot) => slot.recipeId).toSorted(),
  );

  const preferences = await asUser.query(
    api.planningPreferences.getCurrent,
    {},
  );
  expect(preferences).toEqual({
    usualPlanDays: 5,
    usualServings: 2,
    prioritiseSavedRecipes: false,
  });
});

test("planning preference patches preserve unrelated values", async () => {
  const t = createTestContext();
  const { asUser } = await authenticateTestUser(t);
  await asUser.mutation(api.planningPreferences.updateUsual, {
    usualPlanDays: 3,
    usualServings: 2,
    prioritiseSavedRecipes: false,
  });

  await asUser.mutation(api.planningPreferences.updateUsual, {
    usualServings: 6,
  });

  await expect(
    asUser.query(api.planningPreferences.getCurrent, {}),
  ).resolves.toEqual({
    usualPlanDays: 3,
    usualServings: 6,
    prioritiseSavedRecipes: false,
  });
});

test("extending an adjusted plan fills only new trailing days", async () => {
  const t = createTestContext();
  const { asUser } = await authenticateTestUser(t);
  await asUser.mutation(api.mealPlans.claimGuestDraft, {
    claimKey,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    servings: 4,
    mealChoices: guestMealChoices(),
  });
  const sevenDayPlan = await asUser.query(api.mealPlans.getCurrent, {});
  await asUser.mutation(api.mealPlans.adjustActivePlan, {
    mealPlanId: sevenDayPlan!._id,
    expectedUpdatedAt: sevenDayPlan!.updatedAt,
    planDays: 3,
    startDate: planStartDate,
    servings: 4,
    persistForFuture: false,
  });
  const shortPlan = await asUser.query(api.mealPlans.getCurrent, {});
  const preservedSlotIds = shortPlan!.mealSlots.map((slot) => slot._id);

  const result = await asUser.mutation(api.mealPlans.adjustActivePlan, {
    mealPlanId: shortPlan!._id,
    expectedUpdatedAt: shortPlan!.updatedAt,
    planDays: 7,
    startDate: planStartDate,
    servings: 4,
    persistForFuture: false,
  });
  expect(result).toEqual({
    status: "adjusted",
    addedDays: 4,
    removedDates: [],
  });

  const extendedPlan = await asUser.query(api.mealPlans.getCurrent, {});
  expect(
    extendedPlan!.mealSlots
      .slice(0, preservedSlotIds.length)
      .map((slot) => slot._id),
  ).toEqual(preservedSlotIds);
  expect(extendedPlan!.mealSlots.slice(-4).map((slot) => slot.date)).toEqual([
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
    "2026-09-27",
  ]);
});
