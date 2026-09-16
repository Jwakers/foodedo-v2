import type { SavedPlanMealChoice } from "@/features/plan/saved-plan-meal-choices";
import { clearPendingPrePlanSetup } from "@/features/plan/pre-plan-setup-store";
import {
  acceptGuestPlan,
  applyGuestPlanEmptySlots,
  cancelGuestPlanClaim,
  clearGuestPlanMeal,
  countPlannedGuestMeals,
  createGuestDraft,
  extendGuestPlanByOneDay,
  GUEST_PLAN_DAYS,
  GUEST_DRAFT_SCHEMA_VERSION,
  guestDraftMatchesSavedPlan,
  isPlanDays,
  type PlanDays,
  readGuestDraftV1,
  rebaseGuestPlanStartDate,
  requestGuestPlanClaim,
  setGuestPlanMeal,
  shuffleGuestPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { tomorrowPlanDate } from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import {
  createIndexedDbGuestDraftStore,
  type GuestDraftStore,
} from "@/lib/platform/guest-draft-store";

const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);

/**
 * Temporary generation policy: leave one free day so plan review can exercise
 * empty-slot UI. Owned by the plan feature, not domain persistence.
 */
export const GUEST_PLAN_GENERATION_FREE_DAY_INDEX = 2 as const;

const generationFreeDayIndexes = [
  GUEST_PLAN_GENERATION_FREE_DAY_INDEX,
] as const;

const missingDraftMessage = "There is no guest plan on this device to update.";

function guestDraftStore(): GuestDraftStore {
  return createIndexedDbGuestDraftStore();
}

function parseGuestDraft(raw: unknown): GuestDraftV1 | null {
  return readGuestDraftV1(raw, {
    catalogueVersion: standardCatalogue.version,
    catalogueMealIds,
  });
}

export async function readCurrentGuestPlanDraft(
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return parseGuestDraft(await store.read());
}

/** Read-only load for plan review. Does not rewrite storage. */
export async function loadGuestPlanDraftForReview(
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return readCurrentGuestPlanDraft(store);
}

/**
 * Returns the current local guest draft, creating one when missing or invalid.
 * New plans use the temporary free-day generation policy.
 */
export async function ensureGuestPlanDraft({
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
  planDays = GUEST_PLAN_DAYS,
  servings = 4,
  store = guestDraftStore(),
}: {
  now?: number;
  planStartDate?: string;
  planDays?: PlanDays;
  servings?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (existing) return { draft: existing, write: false };

    return {
      draft: createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate,
        planDays,
        servings,
        catalogueMealIds,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      }),
      write: true,
    };
  });
}

/** Starts a pre-plan draft from the settings the user just applied. */
export async function beginConfiguredGuestPlanDraft({
  planStartDate,
  planDays,
  servings,
  preferredCatalogueMealIds = [],
  now = Date.now(),
  store = guestDraftStore(),
}: {
  planStartDate: string;
  planDays: PlanDays;
  servings: number;
  preferredCatalogueMealIds?: readonly string[];
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const validMealIds = new Set(catalogueMealIds);
  const preferredIds = preferredCatalogueMealIds.filter((mealId) =>
    validMealIds.has(mealId),
  );
  const generationMealIds = [
    ...new Set(preferredIds),
    ...catalogueMealIds.filter((mealId) => !preferredIds.includes(mealId)),
  ];
  return store.runMutation(() => {
    return {
      draft: createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate,
        planDays,
        servings,
        catalogueMealIds: generationMealIds,
        now,
      }),
      write: true,
    };
  });
}

/**
 * Opens the replacement-plan workflow with tomorrow as its fixed start date.
 * An editable draft keeps its meal choices and is moved to tomorrow when the
 * calendar date changes. An accepted draft represents an earlier save attempt
 * and is replaced with a fresh plan.
 */
export async function beginNextGuestPlanDraft({
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
  planDays = GUEST_PLAN_DAYS,
  servings = 4,
  store = guestDraftStore(),
}: {
  now?: number;
  planStartDate?: string;
  planDays?: PlanDays;
  servings?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (
      existing !== null &&
      existing.acceptedAt === undefined &&
      existing.planDays === planDays &&
      existing.servings === servings
    ) {
      const rebased = rebaseGuestPlanStartDate(existing, planStartDate, now);
      return { draft: rebased, write: rebased !== existing };
    }

    return {
      draft: createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate,
        planDays,
        servings,
        catalogueMealIds,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      }),
      write: true,
    };
  });
}

/**
 * Opens a fully editable replacement for the active plan's existing date
 * window. The structure stays intact: deliberate free days remain free while
 * occupied slots receive different meals. Saving the reviewed draft is the
 * only point that replaces the active plan.
 */
export async function beginReplannedGuestPlanDraft({
  planStartDate,
  currentMealChoices,
  occupiedDates,
  servings,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  planStartDate: string;
  currentMealChoices: ReadonlyArray<SavedPlanMealChoice>;
  occupiedDates: readonly string[];
  servings: number;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const planDays = isPlanDays(currentMealChoices.length)
    ? currentMealChoices.length
    : GUEST_PLAN_DAYS;
  const occupiedDateSet = new Set(occupiedDates);
  const intentionalFreeDayIndexes = currentMealChoices.flatMap(
    (choice, index) => (occupiedDateSet.has(choice.date) ? [] : [index]),
  );
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    const hasEditableDraft =
      existing !== null &&
      existing.acceptedAt === undefined &&
      existing.planDays === planDays &&
      existing.servings === servings &&
      countPlannedGuestMeals(existing) > 0;
    if (
      hasEditableDraft &&
      existing.planStartDate === planStartDate &&
      !guestDraftMatchesSavedPlan(existing, currentMealChoices)
    ) {
      return { draft: existing, write: false };
    }

    const baseDraft = hasEditableDraft
      ? rebaseGuestPlanStartDate(existing, planStartDate, now)
      : createGuestDraft({
          catalogueVersion: standardCatalogue.version,
          planStartDate,
          planDays,
          servings,
          catalogueMealIds,
          now,
          emptySlotIndexes: intentionalFreeDayIndexes,
        });
    let replanned = baseDraft;
    for (let variant = 0; variant < catalogueMealIds.length; variant += 1) {
      replanned = shuffleGuestPlan(replanned, catalogueMealIds, now);
      if (!guestDraftMatchesSavedPlan(replanned, currentMealChoices)) break;
    }
    if (guestDraftMatchesSavedPlan(replanned, currentMealChoices)) {
      throw new Error("The catalogue could not produce a different plan.");
    }

    return { draft: replanned, write: true };
  });
}

export async function shuffleCurrentGuestPlanDraft({
  now = Date.now(),
  store = guestDraftStore(),
}: {
  now?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing =
      parseGuestDraft(raw) ??
      createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate: tomorrowPlanDate(),
        catalogueMealIds,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      });
    const shuffled = shuffleGuestPlan(existing, catalogueMealIds, now);
    // Re-apply generation free-day so older full drafts pick up the policy.
    const withFreeDay = applyGuestPlanEmptySlots(
      shuffled,
      generationFreeDayIndexes,
      now,
    );
    return { draft: withFreeDay, write: true };
  });
}

export async function removeGuestPlanMeal({
  date,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  date: string;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    return {
      draft: clearGuestPlanMeal(existing, date, now),
      write: true,
    };
  });
}

export async function replaceGuestPlanMeal({
  date,
  catalogueMealId,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  date: string;
  catalogueMealId: string;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    const next = setGuestPlanMeal(
      existing,
      date,
      catalogueMealId,
      catalogueMealIds,
      now,
    );

    return {
      draft: next,
      write: next !== existing,
    };
  });
}

export async function extendCurrentGuestPlanDraft({
  now = Date.now(),
  store = guestDraftStore(),
}: {
  now?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    return {
      draft: extendGuestPlanByOneDay(existing, catalogueMealIds, now),
      write: true,
    };
  });
}

/**
 * Accept the local draft and persist a stable claim key before sign-in / claim.
 * Retries keep the first key so Convex claim stays idempotent.
 */
export async function acceptAndPrepareGuestPlanClaim({
  now = Date.now(),
  claimKey = createGuestClaimKey(),
  store = guestDraftStore(),
}: {
  now?: number;
  claimKey?: string;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }
    if (countPlannedGuestMeals(existing) === 0) {
      throw new Error("Save at least one dinner before keeping this plan.");
    }

    const accepted =
      existing.acceptedAt === undefined
        ? acceptGuestPlan(existing, now)
        : existing;
    const prepared = requestGuestPlanClaim(accepted, claimKey, now);

    return {
      draft: prepared,
      write: prepared !== existing,
    };
  });
}

export function guestPlanClaimMutationArgs(draft: GuestDraftV1) {
  if (draft.claim === undefined) {
    throw new Error("There is no plan claim ready to send.");
  }

  return {
    claimKey: draft.claim.key,
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    catalogueVersion: draft.catalogueVersion,
    planStartDate: draft.planStartDate,
    servings: draft.servings,
    mealChoices: draft.mealChoices.map((choice) => ({
      date: choice.date,
      catalogueMealId: choice.catalogueMealId,
    })),
  };
}

/** Remove only the exact draft revision acknowledged by Convex. */
export async function clearClaimedGuestPlanDraft({
  expectedDraft,
  store = guestDraftStore(),
}: {
  expectedDraft: GuestDraftV1;
  store?: GuestDraftStore;
}): Promise<boolean> {
  const cleared = await store.clearIf((raw) => {
    const current = parseGuestDraft(raw);
    return current !== null && isSameDraftRevision(current, expectedDraft);
  });
  if (cleared) clearPendingPrePlanSetup();
  return cleared;
}

/** Stop automatic claim retries while preserving every local plan choice. */
export async function cancelPendingGuestPlanClaim({
  expectedDraft,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  expectedDraft: GuestDraftV1;
  now?: number;
  store?: GuestDraftStore;
}): Promise<void> {
  await store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }
    if (!isSameDraftRevision(existing, expectedDraft)) {
      return { draft: existing, write: false };
    }

    const cancelled = cancelGuestPlanClaim(existing, now);
    return {
      draft: cancelled,
      write: cancelled !== existing,
    };
  });
}

function isSameDraftRevision(
  current: GuestDraftV1,
  expected: GuestDraftV1,
): boolean {
  if (
    current.schemaVersion !== expected.schemaVersion ||
    current.catalogueVersion !== expected.catalogueVersion ||
    current.planStartDate !== expected.planStartDate ||
    current.updatedAt !== expected.updatedAt ||
    current.claim?.key !== expected.claim?.key ||
    current.mealChoices.length !== expected.mealChoices.length
  ) {
    return false;
  }

  return current.mealChoices.every((choice, index) => {
    const expectedChoice = expected.mealChoices[index];
    return (
      expectedChoice !== undefined &&
      choice.date === expectedChoice.date &&
      choice.catalogueMealId === expectedChoice.catalogueMealId
    );
  });
}

export function createGuestClaimKey() {
  return crypto.randomUUID();
}
