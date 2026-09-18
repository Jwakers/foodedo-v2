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
  readGuestDraft,
  rebaseGuestPlanStartDate,
  requestGuestPlanClaim,
  setGuestPlanMeal,
  shuffleGuestPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { catalogueMealReferenceKey } from "@/lib/domain/recipes";
import { tomorrowPlanDate } from "@/lib/domain/plan-display";
import {
  createIndexedDbGuestDraftStore,
  type GuestDraftStore,
} from "@/lib/platform/guest-draft-store";

export type GuestCatalogueContract = {
  currentMeals: readonly {
    catalogueMealId: string;
    catalogueVersion: number;
  }[];
  readableMeals: readonly {
    catalogueMealId: string;
    catalogueVersion: number;
  }[];
};

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

function parseGuestDraft(
  raw: unknown,
  catalogue: GuestCatalogueContract,
): GuestDraftV1 | null {
  return readGuestDraft(raw, {
    catalogueMeals: catalogue.readableMeals,
  });
}

export async function readStoredGuestPlanDraftMealReferences(
  store: GuestDraftStore = guestDraftStore(),
): Promise<Array<{
  catalogueMealId: string;
  catalogueVersion: number;
}> | null> {
  const raw = await store.read();
  if (typeof raw !== "object" || raw === null) return null;
  const legacyVersion = Reflect.get(raw, "catalogueVersion");
  const choices = Reflect.get(raw, "mealChoices");
  if (!Array.isArray(choices)) return null;

  const references = new Map<
    string,
    { catalogueMealId: string; catalogueVersion: number }
  >();
  for (const choice of choices) {
    if (typeof choice !== "object" || choice === null) return null;
    const catalogueMealId = Reflect.get(choice, "catalogueMealId");
    if (catalogueMealId === null) continue;
    const ownVersion = Reflect.get(choice, "catalogueVersion");
    const catalogueVersion =
      typeof ownVersion === "number" ? ownVersion : legacyVersion;
    if (
      typeof catalogueMealId !== "string" ||
      typeof catalogueVersion !== "number" ||
      !Number.isInteger(catalogueVersion) ||
      catalogueVersion < 1
    ) {
      return null;
    }
    references.set(
      catalogueMealReferenceKey({ catalogueMealId, catalogueVersion }),
      { catalogueMealId, catalogueVersion },
    );
  }
  return [...references.values()];
}

export async function readCurrentGuestPlanDraft(
  catalogue: GuestCatalogueContract,
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return parseGuestDraft(await store.read(), catalogue);
}

/** Read-only load for plan review. Does not rewrite storage. */
export async function loadGuestPlanDraftForReview(
  catalogue: GuestCatalogueContract,
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return readCurrentGuestPlanDraft(catalogue, store);
}

/**
 * Returns the current local guest draft, creating one when missing or invalid.
 * New plans use the temporary free-day generation policy.
 */
export async function ensureGuestPlanDraft({
  catalogue,
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
  planDays = GUEST_PLAN_DAYS,
  servings = 4,
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  now?: number;
  planStartDate?: string;
  planDays?: PlanDays;
  servings?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
    if (existing) return { draft: existing, write: false };

    return {
      draft: createGuestDraft({
        planStartDate,
        planDays,
        servings,
        catalogueMeals,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      }),
      write: true,
    };
  });
}

/** Starts a pre-plan draft from the settings the user just applied. */
export async function beginConfiguredGuestPlanDraft({
  catalogue,
  planStartDate,
  planDays,
  servings,
  preferredCatalogueMealIds = [],
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  planStartDate: string;
  planDays: PlanDays;
  servings: number;
  preferredCatalogueMealIds?: readonly string[];
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  const catalogueMealIds = catalogueMeals.map((meal) => meal.catalogueMealId);
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
        planStartDate,
        planDays,
        servings,
        catalogueMeals: generationMealIds.map((catalogueMealId) => ({
          catalogueMealId,
          catalogueVersion: catalogueMeals.find(
            (meal) => meal.catalogueMealId === catalogueMealId,
          )!.catalogueVersion,
        })),
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
  catalogue,
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
  planDays = GUEST_PLAN_DAYS,
  servings = 4,
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  now?: number;
  planStartDate?: string;
  planDays?: PlanDays;
  servings?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
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
        planStartDate,
        planDays,
        servings,
        catalogueMeals,
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
  catalogue,
  planStartDate,
  currentMealChoices,
  occupiedDates,
  servings,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  planStartDate: string;
  currentMealChoices: ReadonlyArray<SavedPlanMealChoice>;
  occupiedDates: readonly string[];
  servings: number;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  const catalogueMealIds = catalogueMeals.map((meal) => meal.catalogueMealId);
  const planDays = isPlanDays(currentMealChoices.length)
    ? currentMealChoices.length
    : GUEST_PLAN_DAYS;
  const occupiedDateSet = new Set(occupiedDates);
  const intentionalFreeDayIndexes = currentMealChoices.flatMap(
    (choice, index) => (occupiedDateSet.has(choice.date) ? [] : [index]),
  );
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
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
          planStartDate,
          planDays,
          servings,
          catalogueMeals,
          now,
          emptySlotIndexes: intentionalFreeDayIndexes,
        });
    let replanned = baseDraft;
    for (let variant = 0; variant < catalogueMealIds.length; variant += 1) {
      replanned = shuffleGuestPlan(replanned, catalogueMeals, now);
      if (!guestDraftMatchesSavedPlan(replanned, currentMealChoices)) break;
    }
    if (guestDraftMatchesSavedPlan(replanned, currentMealChoices)) {
      throw new Error("The catalogue could not produce a different plan.");
    }

    return { draft: replanned, write: true };
  });
}

export async function shuffleCurrentGuestPlanDraft({
  catalogue,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  return store.runMutation((raw) => {
    const existing =
      parseGuestDraft(raw, catalogue) ??
      createGuestDraft({
        planStartDate: tomorrowPlanDate(),
        catalogueMeals,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      });
    const shuffled = shuffleGuestPlan(existing, catalogueMeals, now);
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
  catalogue,
  date,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  date: string;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
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
  catalogue,
  date,
  catalogueMealId,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  date: string;
  catalogueMealId: string;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    const next = setGuestPlanMeal(
      existing,
      date,
      catalogueMealId,
      catalogueMeals,
      now,
    );

    return {
      draft: next,
      write: next !== existing,
    };
  });
}

export async function extendCurrentGuestPlanDraft({
  catalogue,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  const catalogueMeals = catalogue.currentMeals;
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    return {
      draft: extendGuestPlanByOneDay(existing, catalogueMeals, now),
      write: true,
    };
  });
}

/**
 * Accept the local draft and persist a stable claim key before sign-in / claim.
 * Retries keep the first key so Convex claim stays idempotent.
 */
export async function acceptAndPrepareGuestPlanClaim({
  catalogue,
  now = Date.now(),
  claimKey = createGuestClaimKey(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  now?: number;
  claimKey?: string;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
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
    planStartDate: draft.planStartDate,
    servings: draft.servings,
    mealChoices: draft.mealChoices.map((choice) => ({
      date: choice.date,
      catalogueMealId: choice.catalogueMealId,
      catalogueVersion: choice.catalogueVersion,
    })),
  };
}

/** Remove only the exact draft revision acknowledged by Convex. */
export async function clearClaimedGuestPlanDraft({
  catalogue,
  expectedDraft,
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  expectedDraft: GuestDraftV1;
  store?: GuestDraftStore;
}): Promise<boolean> {
  const cleared = await store.clearIf((raw) => {
    const current = parseGuestDraft(raw, catalogue);
    return current !== null && isSameDraftRevision(current, expectedDraft);
  });
  if (cleared) clearPendingPrePlanSetup();
  return cleared;
}

/** Stop automatic claim retries while preserving every local plan choice. */
export async function cancelPendingGuestPlanClaim({
  catalogue,
  expectedDraft,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  catalogue: GuestCatalogueContract;
  expectedDraft: GuestDraftV1;
  now?: number;
  store?: GuestDraftStore;
}): Promise<void> {
  await store.runMutation((raw) => {
    const existing = parseGuestDraft(raw, catalogue);
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
      choice.catalogueMealId === expectedChoice.catalogueMealId &&
      choice.catalogueVersion === expectedChoice.catalogueVersion
    );
  });
}

export function createGuestClaimKey() {
  return crypto.randomUUID();
}
