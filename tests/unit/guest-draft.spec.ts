import { expect, test } from "@playwright/test";
import {
  acceptGuestPlan,
  completeGuestPlanClaim,
  createGuestDraft,
  GUEST_DRAFT_SCHEMA_VERSION,
  guestDraftMatchesSavedPlan,
  readGuestDraftV1,
  requestGuestPlanClaim,
  shuffleGuestPlan,
  swapGuestPlanMeal,
} from "../../src/lib/domain/guest-draft";

const catalogueMealIds = ["meal-a", "meal-b", "meal-c"];

test("creates seven consecutive dated meal choices", () => {
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });

  expect(draft).toEqual({
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    catalogueVersion: 1,
    planStartDate: "2026-08-29",
    mealChoices: [
      { date: "2026-08-29", catalogueMealId: "meal-a" },
      { date: "2026-08-30", catalogueMealId: "meal-b" },
      { date: "2026-08-31", catalogueMealId: "meal-c" },
      { date: "2026-09-01", catalogueMealId: "meal-a" },
      { date: "2026-09-02", catalogueMealId: "meal-b" },
      { date: "2026-09-03", catalogueMealId: "meal-c" },
      { date: "2026-09-04", catalogueMealId: "meal-a" },
    ],
    createdAt: 100,
    updatedAt: 100,
  });
});

test("swaps one slot or shuffles the plan without changing its dates", () => {
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-26",
    catalogueMealIds,
    now: 100,
  });
  const swapped = swapGuestPlanMeal(draft, "2026-08-27", catalogueMealIds, 200);
  const shuffled = shuffleGuestPlan(swapped, catalogueMealIds, 300);

  expect(swapped.mealChoices[1]).toEqual({
    date: "2026-08-27",
    catalogueMealId: "meal-c",
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

test("keeps one claim key across retries and records acknowledgement", () => {
  const draft = acceptGuestPlan(
    createGuestDraft({
      catalogueVersion: 1,
      planStartDate: "2026-08-26",
      catalogueMealIds,
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

test("restores only the current catalogue and consecutive known choices", () => {
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-26",
    catalogueMealIds,
    now: 100,
  });

  expect(
    readGuestDraftV1(draft, { catalogueVersion: 1, catalogueMealIds }),
  ).toEqual(draft);
  expect(
    readGuestDraftV1(
      { ...draft, catalogueVersion: 2 },
      { catalogueVersion: 1, catalogueMealIds },
    ),
  ).toBeNull();
  expect(
    readGuestDraftV1(
      {
        ...draft,
        mealChoices: draft.mealChoices.map((choice, index) =>
          index === 2 ? { ...choice, date: "2026-09-20" } : choice,
        ),
      },
      { catalogueVersion: 1, catalogueMealIds },
    ),
  ).toBeNull();
});

test("rejects a claim before acceptance and malformed stored claim state", () => {
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-26",
    catalogueMealIds,
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
      { catalogueVersion: 1, catalogueMealIds },
    ),
  ).toBeNull();
});

test("reconciles only the same dated catalogue plan across devices", () => {
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-26",
    catalogueMealIds,
    now: 100,
  });
  const savedChoices = draft.mealChoices.map((choice) => ({ ...choice }));

  expect(guestDraftMatchesSavedPlan(draft, savedChoices)).toBe(true);
  expect(
    guestDraftMatchesSavedPlan(draft, [
      { ...savedChoices[0]!, catalogueMealId: "meal-c" },
      ...savedChoices.slice(1),
    ]),
  ).toBe(false);
  expect(guestDraftMatchesSavedPlan(draft, savedChoices.slice(0, -1))).toBe(
    false,
  );
});
