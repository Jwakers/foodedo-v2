import { expect, test } from "@playwright/test";
import {
  acceptGuestPlan,
  applyGuestPlanEmptySlots,
  cancelGuestPlanClaim,
  chooseGuestPlanMeal,
  clearGuestPlanMeal,
  completeGuestPlanClaim,
  createGuestDraft,
  extendGuestPlanByOneDay,
  planDatesRemovedByShortening,
  GUEST_DRAFT_SCHEMA_VERSION,
  guestDraftMatchesSavedPlan,
  readGuestDraftV1,
  requestGuestPlanClaim,
  setGuestPlanMeal,
  shuffleGuestPlan,
  swapGuestPlanMeal,
} from "../../src/lib/domain/guest-draft";

const catalogueMealIds = ["meal-a", "meal-b", "meal-c"];
const catalogueMeals = catalogueMealIds.map((catalogueMealId) => ({
  catalogueMealId,
  catalogueVersion: 1,
}));

test("creates seven consecutive dated meal choices", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-29",
    catalogueMeals,
    now: 100,
  });

  expect(draft).toEqual({
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate: "2026-08-29",
    planDays: 7,
    servings: 4,
    mealChoices: [
      { date: "2026-08-29", catalogueMealId: "meal-a", catalogueVersion: 1 },
      { date: "2026-08-30", catalogueMealId: "meal-b", catalogueVersion: 1 },
      { date: "2026-08-31", catalogueMealId: "meal-c", catalogueVersion: 1 },
      { date: "2026-09-01", catalogueMealId: "meal-a", catalogueVersion: 1 },
      { date: "2026-09-02", catalogueMealId: "meal-b", catalogueVersion: 1 },
      { date: "2026-09-03", catalogueMealId: "meal-c", catalogueVersion: 1 },
      { date: "2026-09-04", catalogueMealId: "meal-a", catalogueVersion: 1 },
    ],
    createdAt: 100,
    updatedAt: 100,
  });
});

test("extends a plan with a chosen catalogue meal", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-29",
    planDays: 3,
    catalogueMeals,
    now: 100,
  });

  const extended = extendGuestPlanByOneDay(
    draft,
    catalogueMeals,
    200,
    "meal-c",
  );

  expect(extended.planDays).toBe(4);
  expect(extended.mealChoices.slice(0, 3)).toEqual(draft.mealChoices);
  expect(extended.mealChoices[3]).toEqual({
    date: "2026-09-01",
    catalogueMealId: "meal-c",
    catalogueVersion: 1,
  });
  expect(() =>
    extendGuestPlanByOneDay(draft, catalogueMeals, 200, "missing"),
  ).toThrow("That meal is not in this catalogue.");
});

test("reports removed dates only when shortening, not when rebasing", () => {
  expect(
    planDatesRemovedByShortening({
      startDate: "2026-08-29",
      currentPlanDays: 7,
      nextPlanDays: 5,
    }),
  ).toEqual(["2026-09-03", "2026-09-04"]);
  expect(
    planDatesRemovedByShortening({
      startDate: "2026-08-29",
      currentPlanDays: 5,
      nextPlanDays: 5,
    }),
  ).toEqual([]);
});

test("can leave selected days empty and keep them empty across shuffle", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-29",
    catalogueMeals,
    now: 100,
    emptySlotIndexes: [2],
  });

  expect(draft.mealChoices[2]).toEqual({
    date: "2026-08-31",
    catalogueMealId: null,
    catalogueVersion: null,
  });
  expect(draft.mealChoices.map((choice) => choice.catalogueMealId)).toEqual([
    "meal-a",
    "meal-b",
    null,
    "meal-c",
    "meal-a",
    "meal-b",
    "meal-c",
  ]);

  const shuffled = shuffleGuestPlan(draft, catalogueMeals, 200);
  expect(shuffled.mealChoices[2]?.catalogueMealId).toBeNull();
  expect(
    shuffled.mealChoices.filter((choice) => choice.catalogueMealId !== null),
  ).toHaveLength(6);
});

test("applying empty slots clears acceptance and claim like other plan edits", () => {
  const accepted = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-08-29",
      catalogueMeals,
      now: 100,
    }),
    200,
  );
  const claimed = requestGuestPlanClaim(accepted, "claim_key_1234567890", 300);

  const withEmptySlot = applyGuestPlanEmptySlots(claimed, [2], 400);

  expect(withEmptySlot.acceptedAt).toBeUndefined();
  expect(withEmptySlot.claim).toBeUndefined();
  expect(withEmptySlot.mealChoices[2]?.catalogueMealId).toBeNull();
  expect(withEmptySlot.updatedAt).toBe(400);
});

test("clears one planned meal by date into an empty slot", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-29",
    catalogueMeals,
    now: 100,
  });

  const cleared = clearGuestPlanMeal(draft, "2026-08-30", 200);

  expect(cleared.mealChoices[1]).toEqual({
    date: "2026-08-30",
    catalogueMealId: null,
    catalogueVersion: null,
  });
  expect(
    cleared.mealChoices.filter((choice) => choice.catalogueMealId !== null),
  ).toHaveLength(6);
  expect(cleared.updatedAt).toBe(200);
  expect(() => clearGuestPlanMeal(cleared, "2026-08-30", 300)).toThrow(
    "no meal to remove",
  );
});

test("swaps or shuffles clear acceptance so the plan must be kept again", () => {
  const accepted = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-08-26",
      catalogueMeals,
      now: 100,
    }),
    200,
  );

  const swapped = swapGuestPlanMeal(
    accepted,
    "2026-08-27",
    catalogueMeals,
    300,
  );
  const shuffled = shuffleGuestPlan(accepted, catalogueMeals, 300);

  expect(swapped.acceptedAt).toBeUndefined();
  expect(swapped.claim).toBeUndefined();
  expect(shuffled.acceptedAt).toBeUndefined();
  expect(shuffled.claim).toBeUndefined();
});

test("swaps one slot or shuffles the plan without changing its dates", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
  });
  const swapped = swapGuestPlanMeal(draft, "2026-08-27", catalogueMeals, 200);
  const shuffled = shuffleGuestPlan(swapped, catalogueMeals, 300);

  expect(swapped.mealChoices[1]).toEqual({
    date: "2026-08-27",
    catalogueMealId: "meal-c",
    catalogueVersion: 1,
  });
  expect(shuffled.mealChoices.map(({ date }) => date)).toEqual(
    draft.mealChoices.map(({ date }) => date),
  );
  expect(
    shuffled.mealChoices.map(({ catalogueMealId }) => catalogueMealId),
  ).not.toEqual(
    swapped.mealChoices.map(({ catalogueMealId }) => catalogueMealId),
  );
});

test("choose for me swaps a planned day like a swap", () => {
  const draft = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-08-26",
      catalogueMeals,
      now: 100,
    }),
    150,
  );

  const chosen = chooseGuestPlanMeal(draft, "2026-08-27", catalogueMeals, 200);

  expect(chosen).toEqual(
    swapGuestPlanMeal(draft, "2026-08-27", catalogueMeals, 200),
  );
  expect(chosen.acceptedAt).toBeUndefined();
});

test("choose for me fills a free day with a meal not already planned", () => {
  const widerCatalogue = ["meal-a", "meal-b", "meal-c", "meal-d", "meal-e"].map(
    (catalogueMealId) => ({ catalogueMealId, catalogueVersion: 2 }),
  );
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    planDays: 3,
    catalogueMeals: widerCatalogue,
    now: 100,
    emptySlotIndexes: [1],
  });

  const chosen = chooseGuestPlanMeal(draft, "2026-08-27", widerCatalogue, 200);
  const plannedIds = draft.mealChoices.map((choice) => choice.catalogueMealId);

  expect(chosen.mealChoices[1]?.catalogueMealId).not.toBeNull();
  expect(plannedIds).not.toContain(chosen.mealChoices[1]?.catalogueMealId);
  expect(chosen.mealChoices[1]?.catalogueVersion).toBe(2);
  expect(chosen.mealChoices[0]).toEqual(draft.mealChoices[0]);
  expect(chosen.mealChoices[2]).toEqual(draft.mealChoices[2]);
  expect(chosen.updatedAt).toBe(200);
});

test("choose for me still fills a free day when every meal is planned", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
    emptySlotIndexes: [4],
  });

  const chosen = chooseGuestPlanMeal(draft, "2026-08-30", catalogueMeals, 200);

  expect(catalogueMealIds).toContain(chosen.mealChoices[4]?.catalogueMealId);
  expect(() =>
    chooseGuestPlanMeal(draft, "2026-09-30", catalogueMeals, 200),
  ).toThrow("That date is not in this plan.");
});

test("sets a chosen catalogue meal on a planned day", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
  });
  const accepted = acceptGuestPlan(draft, 150);

  const replaced = setGuestPlanMeal(
    accepted,
    "2026-08-27",
    "meal-a",
    catalogueMeals,
    200,
  );

  expect(replaced.mealChoices[1]).toEqual({
    date: "2026-08-27",
    catalogueMealId: "meal-a",
    catalogueVersion: 1,
  });
  expect(replaced.acceptedAt).toBeUndefined();
  expect(replaced.claim).toBeUndefined();
  expect(replaced.updatedAt).toBe(200);
  expect(
    setGuestPlanMeal(replaced, "2026-08-27", "meal-a", catalogueMeals, 300),
  ).toBe(replaced);
  expect(() =>
    setGuestPlanMeal(draft, "2026-08-27", "meal-z", catalogueMeals, 300),
  ).toThrow("not in this catalogue");

  const withFreeDay = clearGuestPlanMeal(draft, "2026-08-27", 350);
  expect(
    setGuestPlanMeal(withFreeDay, "2026-08-27", "meal-c", catalogueMeals, 400)
      .mealChoices[1],
  ).toEqual({
    date: "2026-08-27",
    catalogueMealId: "meal-c",
    catalogueVersion: 1,
  });
});

test("keeps one claim key across retries and records acknowledgement", () => {
  const draft = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-08-26",
      catalogueMeals,
      now: 100,
    }),
    200,
  );
  const requested = requestGuestPlanClaim(draft, "claim_key_1234567890", 300);
  const retried = requestGuestPlanClaim(requested, "different_key_123456", 400);
  const completed = completeGuestPlanClaim(retried, 500);

  expect(retried).toBe(requested);
  expect(completed.claim).toEqual({
    key: "claim_key_1234567890",
    requestedAt: 300,
    completedAt: 500,
  });
});

test("cancels a failed claim without changing the reviewed week", () => {
  const accepted = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-08-26",
      catalogueMeals,
      now: 100,
      emptySlotIndexes: [2],
    }),
    200,
  );
  const requested = requestGuestPlanClaim(
    accepted,
    "claim_key_1234567890",
    300,
  );
  const cancelled = cancelGuestPlanClaim(requested, 400);

  expect(cancelled.mealChoices).toEqual(requested.mealChoices);
  expect(cancelled.acceptedAt).toBe(200);
  expect(cancelled.claim).toBeUndefined();
  expect(cancelled.updatedAt).toBe(400);
});

test("restores only readable meal revisions and consecutive known choices", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
  });

  expect(readGuestDraftV1(draft, { catalogueMeals })).toEqual(draft);
  const mixedRevisionDraft = {
    ...draft,
    mealChoices: draft.mealChoices.map((choice, index) =>
      index === 0 ? { ...choice, catalogueVersion: 2 } : choice,
    ),
  };
  expect(
    readGuestDraftV1(mixedRevisionDraft, {
      catalogueMeals: [
        ...catalogueMeals,
        { catalogueMealId: "meal-a", catalogueVersion: 2 },
      ],
    }),
  ).toEqual(mixedRevisionDraft);
  expect(readGuestDraftV1(mixedRevisionDraft, { catalogueMeals })).toBeNull();
  expect(
    readGuestDraftV1(
      {
        ...draft,
        mealChoices: draft.mealChoices.map((choice, index) =>
          index === 2 ? { ...choice, date: "2026-09-20" } : choice,
        ),
      },
      { catalogueMeals },
    ),
  ).toBeNull();
});

test("rejects a claim before acceptance and malformed stored claim state", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
  });

  expect(() =>
    requestGuestPlanClaim(draft, "claim_key_1234567890", 200),
  ).toThrow("Accept the plan");
  expect(
    readGuestDraftV1(
      {
        ...draft,
        claim: { key: "claim_key_1234567890", requestedAt: 200 },
        updatedAt: 200,
      },
      { catalogueMeals },
    ),
  ).toBeNull();
});

test("reconciles only the same dated catalogue plan across devices", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-08-26",
    catalogueMeals,
    now: 100,
  });
  const savedChoices = draft.mealChoices.map((choice) => ({ ...choice }));

  expect(guestDraftMatchesSavedPlan(draft, savedChoices)).toBe(true);
  expect(
    guestDraftMatchesSavedPlan(draft, [
      { ...savedChoices[0]!, catalogueMealId: "meal-c", catalogueVersion: 1 },
      ...savedChoices.slice(1),
    ]),
  ).toBe(false);
  expect(guestDraftMatchesSavedPlan(draft, savedChoices.slice(0, -1))).toBe(
    false,
  );
});
