import { RECIPE_LIMITS, type CatalogueMealReference } from "./recipes";
import {
  rotatingMealPlanSelectionStrategy,
  selectReplacementMeal,
} from "./meal-plan-selection";

export const GUEST_DRAFT_SCHEMA_VERSION = 3 as const;
export const GUEST_PLAN_DAYS = 7 as const;
export const PLAN_DAY_OPTIONS = [3, 5, 7] as const;
export const MINIMUM_PLAN_SERVINGS = 1 as const;
export const MAXIMUM_PLAN_SERVINGS = 20 as const;
export type PlanDayOption = (typeof PLAN_DAY_OPTIONS)[number];
export type PlanDays = 3 | 4 | 5 | 6 | 7;

const minimumClaimKeyLength = 16;
const maximumClaimKeyLength = 100;
const claimKeyPattern = /^[A-Za-z0-9_-]+$/;
const planDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type GuestMealChoice = {
  date: string;
  catalogueMealId: string | null;
  catalogueVersion: number | null;
};

export type GuestPlanClaim = {
  key: string;
  requestedAt: number;
  completedAt?: number;
};

/** Current in-memory shape; persisted schema versions are an implementation detail. */
export type GuestDraft = {
  schemaVersion: typeof GUEST_DRAFT_SCHEMA_VERSION;
  planStartDate: string;
  planDays: PlanDays;
  servings: number;
  mealChoices: GuestMealChoice[];
  acceptedAt?: number;
  claim?: GuestPlanClaim;
  createdAt: number;
  updatedAt: number;
};

/** @deprecated Prefer the unversioned domain name; this alias reads schema v2/v3. */
export type GuestDraftV1 = GuestDraft;
/** @deprecated Prefer the unversioned domain name. */
export type GuestMealChoiceV1 = GuestMealChoice;
/** @deprecated Prefer the unversioned domain name. */
export type GuestPlanClaimV1 = GuestPlanClaim;

export function createGuestDraft({
  planStartDate,
  catalogueMeals,
  now,
  planDays = GUEST_PLAN_DAYS,
  servings = 4,
  emptySlotIndexes = [],
}: {
  planStartDate: string;
  catalogueMeals: readonly CatalogueMealReference[];
  now: number;
  planDays?: PlanDays;
  servings?: number;
  emptySlotIndexes?: readonly number[];
}): GuestDraftV1 {
  requirePlanDate(planStartDate);
  const catalogueVersions = requireCatalogueMeals(catalogueMeals);
  const catalogueMealIds = [...catalogueVersions.keys()];
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Creation time");
  requirePlanDays(planDays);
  requireServings(servings);
  const emptySlots = requireEmptySlotIndexes(emptySlotIndexes, planDays);

  let mealCursor = 0;
  return {
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate,
    planDays,
    servings,
    mealChoices: Array.from({ length: planDays }, (_, index) => {
      const date = addDaysToPlanDate(planStartDate, index);
      if (emptySlots.has(index)) {
        return { date, catalogueMealId: null, catalogueVersion: null };
      }

      const catalogueMealId =
        catalogueMealIds[mealCursor % catalogueMealIds.length]!;
      mealCursor += 1;
      return {
        date,
        catalogueMealId,
        catalogueVersion: catalogueVersions.get(catalogueMealId)!,
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

/** Clears the given days. Editing clears acceptance/claim like other plan edits. */
export function applyGuestPlanEmptySlots(
  draft: GuestDraftV1,
  emptySlotIndexes: readonly number[],
  now: number,
): GuestDraftV1 {
  requireTimestamp(now, "Update time");
  const emptySlots = requireEmptySlotIndexes(emptySlotIndexes, draft.planDays);
  const mealChoices = draft.mealChoices.map((choice, index) =>
    emptySlots.has(index)
      ? { ...choice, catalogueMealId: null, catalogueVersion: null }
      : choice,
  );

  if (
    mealChoices.every(
      (choice, index) =>
        choice.catalogueMealId === draft.mealChoices[index]?.catalogueMealId,
    )
  ) {
    return draft;
  }

  return editableDraft(draft, mealChoices, now);
}

export function countPlannedGuestMeals(draft: GuestDraftV1) {
  return draft.mealChoices.filter((choice) => choice.catalogueMealId !== null)
    .length;
}

/** Adds one chosen meal to the end of an editable plan, up to seven days. */
export function extendGuestPlanByOneDay(
  draft: GuestDraftV1,
  catalogueMeals: readonly CatalogueMealReference[],
  now: number,
): GuestDraftV1 {
  const catalogueVersions = requireCatalogueMeals(catalogueMeals);
  const catalogueMealIds = [...catalogueVersions.keys()];
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Update time");
  if (draft.planDays >= GUEST_PLAN_DAYS) {
    throw new Error("This plan already has seven days.");
  }

  const plannedMealIds = new Set(
    draft.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null ? [] : [choice.catalogueMealId],
    ),
  );
  const unusedMealIds = catalogueMealIds.filter(
    (mealId) => !plannedMealIds.has(mealId),
  );
  const candidates =
    unusedMealIds.length > 0 ? unusedMealIds : catalogueMealIds;
  const catalogueMealId = rotatingMealPlanSelectionStrategy({
    candidateMealIds: candidates,
    numberOfMeals: 1,
    offset: draft.planDays,
  })[0]!;
  const planDays = (draft.planDays + 1) as PlanDays;

  return {
    schemaVersion: draft.schemaVersion,
    planStartDate: draft.planStartDate,
    planDays,
    servings: draft.servings,
    mealChoices: [
      ...draft.mealChoices,
      {
        date: addDaysToPlanDate(draft.planStartDate, draft.planDays),
        catalogueMealId,
        catalogueVersion: catalogueVersions.get(catalogueMealId)!,
      },
    ],
    createdAt: draft.createdAt,
    updatedAt: now,
  };
}

/** Moves an editable plan window without changing its selected meals. */
export function rebaseGuestPlanStartDate(
  draft: GuestDraftV1,
  planStartDate: string,
  now: number,
): GuestDraftV1 {
  requirePlanDate(planStartDate);
  requireTimestamp(now, "Update time");
  if (draft.planStartDate === planStartDate) return draft;

  return {
    schemaVersion: draft.schemaVersion,
    planStartDate,
    planDays: draft.planDays,
    servings: draft.servings,
    mealChoices: draft.mealChoices.map((choice, index) => ({
      date: addDaysToPlanDate(planStartDate, index),
      catalogueMealId: choice.catalogueMealId,
      catalogueVersion: choice.catalogueVersion,
    })),
    createdAt: draft.createdAt,
    updatedAt: now,
  };
}

/** Reads and upgrades any supported persisted guest draft schema. */
export function readGuestDraft(
  input: unknown,
  { catalogueMeals }: { catalogueMeals: readonly CatalogueMealReference[] },
): GuestDraftV1 | null {
  if (!isRecord(input)) return null;
  const isLegacyDraft = input.schemaVersion === 2;
  if (!isLegacyDraft && input.schemaVersion !== GUEST_DRAFT_SCHEMA_VERSION) {
    return null;
  }
  if (typeof input.planStartDate !== "string") return null;
  if (!isPlanDate(input.planStartDate)) return null;
  if (!isPlanDays(input.planDays) || !isServings(input.servings)) return null;

  const validMeals = requireCatalogueMeals(catalogueMeals);
  const mealChoices = readMealChoices(
    input.mealChoices,
    input.planStartDate,
    input.planDays,
    validMeals,
    isLegacyDraft && typeof input.catalogueVersion === "number"
      ? input.catalogueVersion
      : undefined,
  );
  if (mealChoices === null) return null;

  if (
    !isTimestamp(input.createdAt) ||
    !isTimestamp(input.updatedAt) ||
    input.updatedAt < input.createdAt
  ) {
    return null;
  }

  const acceptedAt = readOptionalTimestamp(input.acceptedAt);
  if (acceptedAt === null || (acceptedAt ?? 0) > input.updatedAt) return null;

  const claim = readClaim(input.claim, acceptedAt, input.updatedAt);
  if (claim === null) return null;

  return {
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    planStartDate: input.planStartDate,
    planDays: input.planDays,
    servings: input.servings,
    mealChoices,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(claim === undefined ? {} : { claim }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

/** @deprecated Prefer `readGuestDraft`; persisted schema versions are internal. */
export const readGuestDraftV1 = readGuestDraft;

export function swapGuestPlanMeal(
  draft: GuestDraftV1,
  date: string,
  catalogueMeals: readonly CatalogueMealReference[],
  now: number,
): GuestDraftV1 {
  const catalogueVersions = requireCatalogueMeals(catalogueMeals);
  const catalogueMealIds = [...catalogueVersions.keys()];
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Update time");

  const choiceIndex = draft.mealChoices.findIndex(
    (choice) => choice.date === date,
  );
  if (choiceIndex === -1) throw new Error("That date is not in this plan.");

  const currentMealId = draft.mealChoices[choiceIndex]!.catalogueMealId;
  if (currentMealId === null) {
    throw new Error("That day has no meal to swap.");
  }

  const nextMealId = selectReplacementMeal({
    candidateMealIds: catalogueMealIds,
    currentMealId,
    plannedMealIds: draft.mealChoices
      .map((choice) => choice.catalogueMealId)
      .filter((mealId): mealId is string => mealId !== null),
  });
  const mealChoices = draft.mealChoices.map((choice, index) =>
    index === choiceIndex
      ? {
          ...choice,
          catalogueMealId: nextMealId,
          catalogueVersion: catalogueVersions.get(nextMealId)!,
        }
      : choice,
  );

  return editableDraft(draft, mealChoices, now);
}

/** Sets or replaces one day with a chosen catalogue meal. Clears acceptance/claim. */
export function setGuestPlanMeal(
  draft: GuestDraftV1,
  date: string,
  catalogueMealId: string,
  catalogueMeals: readonly CatalogueMealReference[],
  now: number,
): GuestDraftV1 {
  const catalogueVersions = requireCatalogueMeals(catalogueMeals);
  const catalogueMealIds = [...catalogueVersions.keys()];
  requireCatalogueMealIds(catalogueMealIds);
  requireMealId(catalogueMealId);
  requireTimestamp(now, "Update time");

  if (!catalogueMealIds.includes(catalogueMealId)) {
    throw new Error("That meal is not in this catalogue.");
  }

  const choiceIndex = draft.mealChoices.findIndex(
    (choice) => choice.date === date,
  );
  if (choiceIndex === -1) throw new Error("That date is not in this plan.");

  const currentMealId = draft.mealChoices[choiceIndex]!.catalogueMealId;
  if (currentMealId === catalogueMealId) return draft;

  const mealChoices = draft.mealChoices.map((choice, index) =>
    index === choiceIndex
      ? {
          ...choice,
          catalogueMealId,
          catalogueVersion: catalogueVersions.get(catalogueMealId)!,
        }
      : choice,
  );

  return editableDraft(draft, mealChoices, now);
}

/** Clears one planned day. Editing clears acceptance/claim like other plan edits. */
export function clearGuestPlanMeal(
  draft: GuestDraftV1,
  date: string,
  now: number,
): GuestDraftV1 {
  requireTimestamp(now, "Update time");

  const choiceIndex = draft.mealChoices.findIndex(
    (choice) => choice.date === date,
  );
  if (choiceIndex === -1) throw new Error("That date is not in this plan.");

  if (draft.mealChoices[choiceIndex]!.catalogueMealId === null) {
    throw new Error("That day has no meal to remove.");
  }

  return applyGuestPlanEmptySlots(draft, [choiceIndex], now);
}

export function shuffleGuestPlan(
  draft: GuestDraftV1,
  catalogueMeals: readonly CatalogueMealReference[],
  now: number,
): GuestDraftV1 {
  const catalogueVersions = requireCatalogueMeals(catalogueMeals);
  const catalogueMealIds = [...catalogueVersions.keys()];
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Update time");

  const filledMealIds = draft.mealChoices
    .map((choice) => choice.catalogueMealId)
    .filter((mealId): mealId is string => mealId !== null);
  if (filledMealIds.length === 0) {
    return editableDraft(draft, draft.mealChoices, now);
  }

  const firstMealId = filledMealIds[0]!;
  const firstMealIndex = catalogueMealIds.indexOf(firstMealId);
  if (firstMealIndex === -1) {
    throw new Error("A current meal is not in this catalogue.");
  }
  const selectedMealIds = rotatingMealPlanSelectionStrategy({
    candidateMealIds: catalogueMealIds,
    numberOfMeals: filledMealIds.length,
    offset: firstMealIndex + 1,
  });

  let filledCursor = 0;
  const mealChoices = draft.mealChoices.map((choice) => {
    if (choice.catalogueMealId === null) return choice;
    const catalogueMealId = selectedMealIds[filledCursor]!;
    filledCursor += 1;
    return {
      ...choice,
      catalogueMealId,
      catalogueVersion: catalogueVersions.get(catalogueMealId)!,
    };
  });

  return editableDraft(draft, mealChoices, now);
}

export function acceptGuestPlan(
  draft: GuestDraftV1,
  now: number,
): GuestDraftV1 {
  requireTimestamp(now, "Acceptance time");

  return {
    ...draft,
    acceptedAt: now,
    claim: undefined,
    updatedAt: now,
  };
}

export function requestGuestPlanClaim(
  draft: GuestDraftV1,
  claimKey: string,
  now: number,
): GuestDraftV1 {
  if (draft.acceptedAt === undefined) {
    throw new Error("Accept the plan before saving it.");
  }
  requireClaimKey(claimKey);
  requireTimestamp(now, "Claim request time");

  if (draft.claim !== undefined) return draft;

  return {
    ...draft,
    claim: { key: claimKey, requestedAt: now },
    updatedAt: now,
  };
}

/**
 * Stops retrying an unsuccessful save without changing the reviewed week.
 * A later explicit Save creates a fresh idempotency key.
 */
export function cancelGuestPlanClaim(
  draft: GuestDraftV1,
  now: number,
): GuestDraftV1 {
  requireTimestamp(now, "Claim cancellation time");
  if (draft.claim === undefined) return draft;

  return {
    ...draft,
    claim: undefined,
    updatedAt: now,
  };
}

export function completeGuestPlanClaim(
  draft: GuestDraftV1,
  now: number,
): GuestDraftV1 {
  if (draft.claim === undefined) {
    throw new Error("There is no plan claim to complete.");
  }
  requireTimestamp(now, "Claim completion time");

  return {
    ...draft,
    claim: { ...draft.claim, completedAt: now },
    updatedAt: now,
  };
}

export function guestDraftMatchesSavedPlan(
  draft: GuestDraftV1,
  mealChoices: ReadonlyArray<{
    date: string;
    catalogueMealId: string | null;
  }>,
) {
  if (draft.mealChoices.length !== mealChoices.length) return false;

  return draft.mealChoices.every((choice, index) => {
    const savedChoice = mealChoices[index];
    return (
      savedChoice !== undefined &&
      choice.date === savedChoice.date &&
      choice.catalogueMealId === savedChoice.catalogueMealId
    );
  });
}

export function addDaysToPlanDate(date: string, days: number) {
  requirePlanDate(date);
  if (!Number.isInteger(days))
    throw new Error("Day offset must be an integer.");

  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatPlanDate(next);
}

/** Dates removed when a plan is shortened; rebasing alone removes nothing. */
export function planDatesRemovedByShortening({
  startDate,
  currentPlanDays,
  nextPlanDays,
}: {
  startDate: string;
  currentPlanDays: number;
  nextPlanDays: number;
}): string[] {
  requirePlanDate(startDate);
  if (
    !Number.isInteger(currentPlanDays) ||
    currentPlanDays < 1 ||
    !Number.isInteger(nextPlanDays) ||
    nextPlanDays < 1
  ) {
    throw new Error("Plan lengths must be positive whole numbers.");
  }
  if (nextPlanDays >= currentPlanDays) return [];

  return Array.from({ length: currentPlanDays - nextPlanDays }, (_, index) =>
    addDaysToPlanDate(startDate, nextPlanDays + index),
  );
}

export function isPlanDate(value: string) {
  const match = planDatePattern.exec(value);
  if (match === null) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isPlanDays(value: unknown): value is PlanDays {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 3 &&
    value <= GUEST_PLAN_DAYS
  );
}

export function isPlanDayOption(value: unknown): value is PlanDayOption {
  return PLAN_DAY_OPTIONS.some((option) => option === value);
}

function requirePlanDays(value: unknown): asserts value is PlanDays {
  if (!isPlanDays(value)) {
    throw new Error("Plan days must be a whole number between 3 and 7.");
  }
}

function isServings(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= MINIMUM_PLAN_SERVINGS &&
    Number(value) <= MAXIMUM_PLAN_SERVINGS
  );
}

function requireServings(value: unknown): asserts value is number {
  if (!isServings(value)) {
    throw new Error(
      `Servings must be a whole number between ${MINIMUM_PLAN_SERVINGS} and ${MAXIMUM_PLAN_SERVINGS}.`,
    );
  }
}

function editableDraft(
  draft: GuestDraftV1,
  mealChoices: GuestMealChoiceV1[],
  now: number,
): GuestDraftV1 {
  return {
    schemaVersion: draft.schemaVersion,
    planStartDate: draft.planStartDate,
    planDays: draft.planDays,
    servings: draft.servings,
    mealChoices,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
}

function readMealChoices(
  input: unknown,
  planStartDate: string,
  planDays: PlanDays,
  validMeals: ReadonlyMap<string, number>,
  legacyCatalogueVersion?: number,
): GuestMealChoiceV1[] | null {
  if (!Array.isArray(input) || input.length !== planDays) return null;

  const choices: GuestMealChoiceV1[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const choice = input[index];
    if (
      !isRecord(choice) ||
      choice.date !== addDaysToPlanDate(planStartDate, index)
    ) {
      return null;
    }

    if (choice.catalogueMealId === null) {
      if (
        choice.catalogueVersion !== null &&
        choice.catalogueVersion !== undefined
      ) {
        return null;
      }
      choices.push({
        date: choice.date,
        catalogueMealId: null,
        catalogueVersion: null,
      });
      continue;
    }

    const catalogueVersion =
      typeof choice.catalogueVersion === "number"
        ? choice.catalogueVersion
        : legacyCatalogueVersion;
    if (
      typeof choice.catalogueMealId !== "string" ||
      typeof catalogueVersion !== "number" ||
      validMeals.get(choice.catalogueMealId) !== catalogueVersion
    ) {
      return null;
    }

    choices.push({
      date: choice.date,
      catalogueMealId: choice.catalogueMealId,
      catalogueVersion,
    });
  }
  return choices;
}

function requireCatalogueMeals(
  meals: readonly CatalogueMealReference[],
): ReadonlyMap<string, number> {
  const versions = new Map<string, number>();
  for (const meal of meals) {
    requireMealId(meal.catalogueMealId);
    requirePositiveWholeNumber(meal.catalogueVersion, "Catalogue meal version");
    if (versions.has(meal.catalogueMealId)) {
      throw new Error("Catalogue meal IDs must be unique.");
    }
    versions.set(meal.catalogueMealId, meal.catalogueVersion);
  }
  if (versions.size === 0) throw new Error("The catalogue must not be empty.");
  return versions;
}

function requireEmptySlotIndexes(indexes: readonly number[], planDays: number) {
  const emptySlots = new Set<number>();
  for (const index of indexes) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= planDays ||
      emptySlots.has(index)
    ) {
      throw new Error("Empty slot indexes must be unique days in the plan.");
    }
    emptySlots.add(index);
  }
  return emptySlots;
}

function readClaim(
  input: unknown,
  acceptedAt: number | undefined,
  updatedAt: number,
): GuestPlanClaimV1 | undefined | null {
  if (input === undefined) return undefined;
  if (acceptedAt === undefined || !isRecord(input)) return null;
  if (typeof input.key !== "string" || !isGuestClaimKey(input.key)) return null;
  if (!isTimestamp(input.requestedAt) || input.requestedAt > updatedAt) {
    return null;
  }

  const completedAt = readOptionalTimestamp(input.completedAt);
  if (
    completedAt === null ||
    (completedAt !== undefined &&
      (completedAt < input.requestedAt || completedAt > updatedAt))
  ) {
    return null;
  }

  return {
    key: input.key,
    requestedAt: input.requestedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function readOptionalTimestamp(value: unknown) {
  if (value === undefined) return undefined;
  return isTimestamp(value) ? value : null;
}

function requireCatalogueMealIds(catalogueMealIds: readonly string[]) {
  if (catalogueMealIds.length === 0) {
    throw new Error("At least one catalogue meal is required.");
  }
  for (const id of catalogueMealIds) requireMealId(id);
  if (new Set(catalogueMealIds).size !== catalogueMealIds.length) {
    throw new Error("Catalogue meal IDs must be unique.");
  }
}

function requireMealId(value: string) {
  const length = value.trim().length;
  if (length === 0 || length > RECIPE_LIMITS.catalogueMealId) {
    throw new Error("Catalogue meal ID is invalid.");
  }
}

function requireClaimKey(value: string) {
  if (!isGuestClaimKey(value)) throw new Error("Claim key is invalid.");
}

export function isGuestClaimKey(value: string) {
  return (
    value.length >= minimumClaimKeyLength &&
    value.length <= maximumClaimKeyLength &&
    claimKeyPattern.test(value)
  );
}

function requirePlanDate(value: string) {
  if (!isPlanDate(value)) throw new Error("Plan date must use YYYY-MM-DD.");
}

function formatPlanDate(date: Date) {
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function requirePositiveWholeNumber(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive whole number.`);
  }
}

function requireTimestamp(value: number, label: string) {
  if (!isTimestamp(value)) {
    throw new Error(`${label} must be a non-negative timestamp.`);
  }
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
