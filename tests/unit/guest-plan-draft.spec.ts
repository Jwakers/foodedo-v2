import { expect, test } from "@playwright/test";
import {
  ensureGuestPlanDraft,
  removeGuestPlanMeal,
  replaceGuestPlanMeal,
  shuffleCurrentGuestPlanDraft,
} from "../../src/features/plan/guest-plan-draft";
import {
  countPlannedGuestMeals,
  createGuestDraft,
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
