import { expect, test } from "@playwright/test";
import {
  beginNextGuestPlanDraft,
  beginReplannedGuestPlanDraft,
  ensureGuestPlanDraft,
  extendCurrentGuestPlanDraft,
  acceptAndPrepareGuestPlanClaim,
  cancelPendingGuestPlanClaim,
  clearClaimedGuestPlanDraft,
  guestPlanClaimMutationArgs,
  removeGuestPlanMeal,
  replaceGuestPlanMeal,
  shuffleCurrentGuestPlanDraft,
} from "../../src/features/plan/guest-plan-draft";
import {
  acceptGuestPlan,
  countPlannedGuestMeals,
  createGuestDraft,
  shuffleGuestPlan,
  type GuestDraftV1,
} from "../../src/lib/domain/guest-draft";
import { standardCatalogue } from "../../src/lib/domain/standard-catalogue";
import type {
  GuestDraftMutationResult,
  GuestDraftStore,
} from "../../src/lib/platform/guest-draft-store";

const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);

function createMemoryStore(
  initial: GuestDraftV1 | null = null,
  {
    readDelayMs = 0,
  }: {
    readDelayMs?: number;
  } = {},
): GuestDraftStore & { writes: number } {
  let draft: GuestDraftV1 | null = initial;
  let mutationTail: Promise<void> = Promise.resolve();
  const store: GuestDraftStore & { writes: number } = {
    writes: 0,
    async read() {
      const snapshot = draft;
      if (readDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, readDelayMs));
      }
      return snapshot;
    },
    async write(next) {
      draft = next;
      store.writes += 1;
    },
    async clear() {
      draft = null;
    },
    async clearIf(predicate) {
      if (!predicate(draft)) return false;
      draft = null;
      return true;
    },
    runMutation(mutate) {
      const run = mutationTail.then(async () => {
        if (readDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, readDelayMs));
        }
        const result: GuestDraftMutationResult = mutate(draft);
        if (result.write) {
          draft = result.draft;
          store.writes += 1;
        }
        return result.draft;
      });
      mutationTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  return store;
}

test("serializes concurrent meal removals so both clears persist", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed, { readDelayMs: 20 });
  const before = countPlannedGuestMeals(seed);

  const [first, second] = await Promise.all([
    removeGuestPlanMeal({ date: "2026-08-29", now: 200, store }),
    removeGuestPlanMeal({ date: "2026-08-30", now: 300, store }),
  ]);

  expect(countPlannedGuestMeals(first)).toBe(before - 1);
  expect(countPlannedGuestMeals(second)).toBe(before - 2);
  expect(
    second.mealChoices.filter((choice) => choice.catalogueMealId === null),
  ).toHaveLength(2);
  expect(
    second.mealChoices.find((choice) => choice.date === "2026-08-29")
      ?.catalogueMealId,
  ).toBeNull();
  expect(
    second.mealChoices.find((choice) => choice.date === "2026-08-30")
      ?.catalogueMealId,
  ).toBeNull();
});

test("serializes shuffle after remove against the latest snapshot", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed, { readDelayMs: 20 });

  const [, shuffled] = await Promise.all([
    removeGuestPlanMeal({ date: "2026-08-29", now: 200, store }),
    shuffleCurrentGuestPlanDraft({ now: 300, store }),
  ]);

  // Remove clears day 0; shuffle then re-applies the generation free-day (index 2).
  expect(
    shuffled.mealChoices.find((choice) => choice.date === "2026-08-29")
      ?.catalogueMealId,
  ).toBeNull();
  expect(
    shuffled.mealChoices.find((choice) => choice.date === "2026-08-31")
      ?.catalogueMealId,
  ).toBeNull();
  expect(countPlannedGuestMeals(shuffled)).toBe(
    countPlannedGuestMeals(seed) - 2,
  );
});

test("ensure still creates a draft when storage is empty", async () => {
  const store = createMemoryStore(null);
  const draft = await ensureGuestPlanDraft({
    now: 100,
    planStartDate: "2026-08-29",
    store,
  });

  expect(draft.planStartDate).toBe("2026-08-29");
  expect(draft.mealChoices).toHaveLength(7);
  expect(store.writes).toBe(1);
});

test("adds one trailing draft day at a time and stops at seven", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    planDays: 5,
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed);

  const sixDays = await extendCurrentGuestPlanDraft({ now: 200, store });
  expect(sixDays.planDays).toBe(6);
  expect(sixDays.mealChoices.slice(0, 5)).toEqual(seed.mealChoices);
  expect(sixDays.mealChoices[5]).toMatchObject({ date: "2026-09-03" });
  expect(
    seed.mealChoices.some(
      (choice) =>
        choice.catalogueMealId === sixDays.mealChoices[5]?.catalogueMealId,
    ),
  ).toBe(false);

  const sevenDays = await extendCurrentGuestPlanDraft({ now: 300, store });
  expect(sevenDays.planDays).toBe(7);
  expect(sevenDays.mealChoices.slice(0, 6)).toEqual(sixDays.mealChoices);
  expect(sevenDays.mealChoices[6]).toMatchObject({ date: "2026-09-04" });

  await expect(
    extendCurrentGuestPlanDraft({ now: 400, store }),
  ).rejects.toThrow("This plan already has seven days.");
  expect(store.writes).toBe(2);
});

test("starts a replacement plan tomorrow when no editable draft exists", async () => {
  const store = createMemoryStore(null);

  const next = await beginNextGuestPlanDraft({
    now: 200,
    planStartDate: "2026-08-29",
    store,
  });

  expect(next.planStartDate).toBe("2026-08-29");
  expect(next.mealChoices).toHaveLength(7);
  expect(next.mealChoices[2]?.catalogueMealId).toBeNull();
  expect(next.createdAt).toBe(200);
  expect(store.writes).toBe(1);
});

test("moves an editable replacement plan to tomorrow without losing choices", async () => {
  const inProgressDraft = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-28",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [0, 2],
  });
  const store = createMemoryStore(inProgressDraft);

  const resumed = await beginNextGuestPlanDraft({
    now: 200,
    planStartDate: "2026-08-29",
    store,
  });

  expect(resumed.planStartDate).toBe("2026-08-29");
  expect(resumed.mealChoices.map((choice) => choice.catalogueMealId)).toEqual(
    inProgressDraft.mealChoices.map((choice) => choice.catalogueMealId),
  );
  expect(resumed.mealChoices[0]?.date).toBe("2026-08-29");
  expect(resumed.mealChoices[6]?.date).toBe("2026-09-04");
  expect(resumed.createdAt).toBe(100);
  expect(resumed.updatedAt).toBe(200);
  expect(store.writes).toBe(1);
});

test("reuses an editable replacement plan already starting tomorrow", async () => {
  const tomorrowDraft = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [0, 2],
  });
  const store = createMemoryStore(tomorrowDraft);

  const resumed = await beginNextGuestPlanDraft({
    now: 200,
    planStartDate: "2026-08-29",
    store,
  });

  expect(resumed).toEqual(tomorrowDraft);
  expect(store.writes).toBe(0);
});

test("starts fresh instead of reopening an already accepted draft", async () => {
  const acceptedDraft = acceptGuestPlan(
    createGuestDraft({
      catalogueVersion: standardCatalogue.version,
      planStartDate: "2026-08-28",
      catalogueMealIds,
      now: 100,
    }),
    150,
  );
  const store = createMemoryStore(acceptedDraft);

  const next = await beginNextGuestPlanDraft({
    now: 200,
    planStartDate: "2026-08-29",
    store,
  });

  expect(next.planStartDate).toBe("2026-08-29");
  expect(next.acceptedAt).toBeUndefined();
  expect(next.createdAt).toBe(200);
  expect(store.writes).toBe(1);
});

test("replans the active date window with a fresh meal selection", async () => {
  const store = createMemoryStore(null);
  const initial = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-20",
    catalogueMealIds,
    now: 200,
    emptySlotIndexes: [1, 5],
  });
  // The first generated alternative is this shuffled variant, so the replan
  // must advance again rather than accidentally returning the active plan.
  const active = shuffleGuestPlan(initial, catalogueMealIds, 200);
  // A personal recipe has no catalogue ID but still occupies its date.
  const activeChoices = active.mealChoices.map((choice, index) =>
    index === 3 ? { ...choice, catalogueMealId: null } : choice,
  );

  const replanned = await beginReplannedGuestPlanDraft({
    planStartDate: "2026-08-20",
    currentMealChoices: activeChoices,
    occupiedDates: active.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null ? [] : [choice.date],
    ),
    servings: 4,
    now: 200,
    store,
  });

  expect(replanned.planStartDate).toBe("2026-08-20");
  expect(replanned.mealChoices).not.toEqual(activeChoices);
  expect(replanned.mealChoices[1]?.catalogueMealId).toBeNull();
  expect(replanned.mealChoices[5]?.catalogueMealId).toBeNull();
  expect(replanned.mealChoices[2]?.catalogueMealId).not.toBeNull();
  expect(replanned.mealChoices[3]?.catalogueMealId).not.toBeNull();
  expect(store.writes).toBe(1);
});

test("resumes an editable replan for the same active date window", async () => {
  const inProgress = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-20",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [1, 4],
  });
  const store = createMemoryStore(inProgress);

  const resumed = await beginReplannedGuestPlanDraft({
    planStartDate: "2026-08-20",
    currentMealChoices: shuffleGuestPlan(inProgress, catalogueMealIds, 150)
      .mealChoices,
    occupiedDates: inProgress.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null ? [] : [choice.date],
    ),
    servings: 4,
    now: 200,
    store,
  });

  expect(resumed).toEqual(inProgress);
  expect(store.writes).toBe(0);
});

test("refreshes a local draft that still matches the active plan", async () => {
  const active = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-20",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [2],
  });
  const store = createMemoryStore(active);

  const replanned = await beginReplannedGuestPlanDraft({
    planStartDate: "2026-08-20",
    currentMealChoices: active.mealChoices,
    occupiedDates: active.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null ? [] : [choice.date],
    ),
    servings: 4,
    now: 200,
    store,
  });

  expect(replanned.mealChoices).not.toEqual(active.mealChoices);
  expect(store.writes).toBe(1);
});

test("remove rejects empty storage without persisting a draft", async () => {
  const store = createMemoryStore(null);

  await expect(
    removeGuestPlanMeal({ date: "2026-08-29", now: 200, store }),
  ).rejects.toThrow("There is no guest plan on this device to update.");
  expect(store.writes).toBe(0);
  expect(await store.read()).toBeNull();
});

test("replaces a planned meal with a chosen catalogue recipe", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed);
  const nextMealId = catalogueMealIds.find(
    (id) => id !== seed.mealChoices[0]?.catalogueMealId,
  );
  expect(nextMealId).toBeTruthy();

  const replaced = await replaceGuestPlanMeal({
    date: "2026-08-29",
    catalogueMealId: nextMealId!,
    now: 200,
    store,
  });

  expect(replaced.mealChoices[0]?.catalogueMealId).toBe(nextMealId);
  expect(replaced.updatedAt).toBe(200);
  expect(store.writes).toBe(1);
});

test("replace rejects empty storage without persisting a draft", async () => {
  const store = createMemoryStore(null);

  await expect(
    replaceGuestPlanMeal({
      date: "2026-08-29",
      catalogueMealId: catalogueMealIds[0]!,
      now: 200,
      store,
    }),
  ).rejects.toThrow("There is no guest plan on this device to update.");
  expect(store.writes).toBe(0);
});

test("accepts a draft and keeps one claim key across retries", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [2],
  });
  const store = createMemoryStore(seed);

  const prepared = await acceptAndPrepareGuestPlanClaim({
    now: 200,
    claimKey: "claim_key_1234567890",
    store,
  });
  const retried = await acceptAndPrepareGuestPlanClaim({
    now: 300,
    claimKey: "different_key_123456",
    store,
  });

  expect(prepared.acceptedAt).toBe(200);
  expect(prepared.claim).toEqual({
    key: "claim_key_1234567890",
    requestedAt: 200,
  });
  expect(retried.claim?.key).toBe("claim_key_1234567890");
  expect(guestPlanClaimMutationArgs(prepared).mealChoices).toEqual(
    prepared.mealChoices,
  );
});

test("cancels a pending claim but preserves the exact local draft", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [2],
  });
  const store = createMemoryStore(seed);
  const prepared = await acceptAndPrepareGuestPlanClaim({
    now: 200,
    claimKey: "claim_key_1234567890",
    store,
  });

  await cancelPendingGuestPlanClaim({
    expectedDraft: prepared,
    now: 300,
    store,
  });

  const cancelled = (await store.read()) as GuestDraftV1;
  expect(cancelled.mealChoices).toEqual(prepared.mealChoices);
  expect(cancelled.acceptedAt).toBe(prepared.acceptedAt);
  expect(cancelled.claim).toBeUndefined();
  expect(store.writes).toBe(2);
});

test("clears only the draft revision acknowledged by a claim", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed);
  const submitted = await acceptAndPrepareGuestPlanClaim({
    now: 200,
    claimKey: "claim_key_1234567890",
    store,
  });
  const replacementMealId = catalogueMealIds.find(
    (id) => id !== submitted.mealChoices[0]?.catalogueMealId,
  )!;

  const newerDraft = await replaceGuestPlanMeal({
    date: submitted.mealChoices[0]!.date,
    catalogueMealId: replacementMealId,
    now: 300,
    store,
  });
  const cleared = await clearClaimedGuestPlanDraft({
    expectedDraft: submitted,
    store,
  });

  expect(cleared).toBe(false);
  expect(await store.read()).toEqual(newerDraft);
});

test("does not cancel a newer claim prepared in another tab", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
  });
  const store = createMemoryStore(seed);
  const firstClaim = await acceptAndPrepareGuestPlanClaim({
    now: 200,
    claimKey: "claim_key_1234567890",
    store,
  });
  const replacementMealId = catalogueMealIds.find(
    (id) => id !== firstClaim.mealChoices[0]?.catalogueMealId,
  )!;
  await replaceGuestPlanMeal({
    date: firstClaim.mealChoices[0]!.date,
    catalogueMealId: replacementMealId,
    now: 300,
    store,
  });
  const newerClaim = await acceptAndPrepareGuestPlanClaim({
    now: 400,
    claimKey: "new_claim_key_123456",
    store,
  });

  await cancelPendingGuestPlanClaim({
    expectedDraft: firstClaim,
    now: 500,
    store,
  });

  expect(await store.read()).toEqual(newerClaim);
});

test("refuses to prepare a claim when every day is empty", async () => {
  const seed = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: "2026-08-29",
    catalogueMealIds,
    now: 100,
    emptySlotIndexes: [0, 1, 2, 3, 4, 5, 6],
  });
  const store = createMemoryStore(seed);

  await expect(
    acceptAndPrepareGuestPlanClaim({
      now: 200,
      claimKey: "claim_key_1234567890",
      store,
    }),
  ).rejects.toThrow("Save at least one dinner");
});
