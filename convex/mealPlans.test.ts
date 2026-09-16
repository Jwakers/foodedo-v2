import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
} from "../src/lib/domain/guest-draft";
import { standardCatalogue } from "../src/lib/domain/standard-catalogue";

const modules = import.meta.glob("./**/*.ts");
const ownerSubject = "test-user";
const planStartDate = "2026-09-21";
const claimKey = "claim_key_123456789";

function guestMealChoices() {
  const mealIds = standardCatalogue.meals.slice(0, 5).map((meal) => meal.id);
  return Array.from({ length: 7 }, (_, index) => ({
    date: addDaysToPlanDate(planStartDate, index),
    catalogueMealId:
      index === 2 || index === 5
        ? null
        : (mealIds[index % mealIds.length] ?? null),
  }));
}

test("claim is idempotent, archives the prior plan, and preserves free days", async () => {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: ownerSubject });
  const priorPlanId = await t.run(async (ctx) => {
    return await ctx.db.insert("mealPlans", {
      ownerSubject,
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
    catalogueVersion: standardCatalogue.version,
    planStartDate,
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
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: ownerSubject });
  const priorPlanId = await t.run(async (ctx) => {
    return await ctx.db.insert("mealPlans", {
      ownerSubject,
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
    catalogueVersion: standardCatalogue.version + 1,
    planStartDate,
    mealChoices: guestMealChoices(),
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
  const t = convexTest(schema, modules);

  await expect(
    t.mutation(api.mealPlans.claimGuestDraft, {
      claimKey,
      schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
      catalogueVersion: standardCatalogue.version,
      planStartDate,
      mealChoices: guestMealChoices(),
    }),
  ).rejects.toThrow("Sign in to access personal Foodedo data.");
});
