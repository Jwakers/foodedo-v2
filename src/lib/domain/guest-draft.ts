import { RECIPE_LIMITS } from "./recipes";

export const GUEST_DRAFT_SCHEMA_VERSION = 1 as const;
export const GUEST_PLAN_DAYS = 7 as const;

const minimumClaimKeyLength = 16;
const maximumClaimKeyLength = 100;
const claimKeyPattern = /^[A-Za-z0-9_-]+$/;
const planDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type GuestMealChoiceV1 = {
  date: string;
  catalogueMealId: string;
};

export type GuestPlanClaimV1 = {
  key: string;
  requestedAt: number;
  completedAt?: number;
};

export type GuestDraftV1 = {
  schemaVersion: typeof GUEST_DRAFT_SCHEMA_VERSION;
  catalogueVersion: number;
  planStartDate: string;
  mealChoices: GuestMealChoiceV1[];
  acceptedAt?: number;
  claim?: GuestPlanClaimV1;
  createdAt: number;
  updatedAt: number;
};

export function createGuestDraft({
  catalogueVersion,
  planStartDate,
  catalogueMealIds,
  now,
}: {
  catalogueVersion: number;
  planStartDate: string;
  catalogueMealIds: readonly string[];
  now: number;
}): GuestDraftV1 {
  requirePositiveWholeNumber(catalogueVersion, "Catalogue version");
  requirePlanDate(planStartDate);
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Creation time");

  return {
    schemaVersion: GUEST_DRAFT_SCHEMA_VERSION,
    catalogueVersion,
    planStartDate,
    mealChoices: Array.from({ length: GUEST_PLAN_DAYS }, (_, index) => ({
      date: addDaysToPlanDate(planStartDate, index),
      catalogueMealId: catalogueMealIds[index % catalogueMealIds.length]!,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function readGuestDraftV1(
  input: unknown,
  {
    catalogueVersion,
    catalogueMealIds,
  }: {
    catalogueVersion: number;
    catalogueMealIds: readonly string[];
  },
): GuestDraftV1 | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== GUEST_DRAFT_SCHEMA_VERSION) return null;
  if (input.catalogueVersion !== catalogueVersion) return null;
  if (typeof input.planStartDate !== "string") return null;
  if (!isPlanDate(input.planStartDate)) return null;

  const validMealIds = new Set(catalogueMealIds);
  const mealChoices = readMealChoices(
    input.mealChoices,
    input.planStartDate,
    validMealIds,
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
    catalogueVersion,
    planStartDate: input.planStartDate,
    mealChoices,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(claim === undefined ? {} : { claim }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function swapGuestPlanMeal(
  draft: GuestDraftV1,
  date: string,
  catalogueMealIds: readonly string[],
  now: number,
): GuestDraftV1 {
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Update time");

  const choiceIndex = draft.mealChoices.findIndex(
    (choice) => choice.date === date,
  );
  if (choiceIndex === -1) throw new Error("That date is not in this plan.");

  const currentMealId = draft.mealChoices[choiceIndex]!.catalogueMealId;
  const catalogueIndex = catalogueMealIds.indexOf(currentMealId);
  if (catalogueIndex === -1) {
    throw new Error("The current meal is not in this catalogue.");
  }

  const nextMealId =
    catalogueMealIds[(catalogueIndex + 1) % catalogueMealIds.length]!;
  const mealChoices = draft.mealChoices.map((choice, index) =>
    index === choiceIndex ? { ...choice, catalogueMealId: nextMealId } : choice,
  );

  return editableDraft(draft, mealChoices, now);
}

export function shuffleGuestPlan(
  draft: GuestDraftV1,
  catalogueMealIds: readonly string[],
  now: number,
): GuestDraftV1 {
  requireCatalogueMealIds(catalogueMealIds);
  requireTimestamp(now, "Update time");

  const mealChoices = draft.mealChoices.map((choice, index) => {
    const currentIndex = catalogueMealIds.indexOf(choice.catalogueMealId);
    if (currentIndex === -1) {
      throw new Error("A current meal is not in this catalogue.");
    }

    return {
      ...choice,
      catalogueMealId:
        catalogueMealIds[(currentIndex + index + 1) % catalogueMealIds.length]!,
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

function editableDraft(
  draft: GuestDraftV1,
  mealChoices: GuestMealChoiceV1[],
  now: number,
): GuestDraftV1 {
  return {
    schemaVersion: draft.schemaVersion,
    catalogueVersion: draft.catalogueVersion,
    planStartDate: draft.planStartDate,
    mealChoices,
    createdAt: draft.createdAt,
    updatedAt: now,
  };
}

function readMealChoices(
  input: unknown,
  planStartDate: string,
  validMealIds: ReadonlySet<string>,
): GuestMealChoiceV1[] | null {
  if (!Array.isArray(input) || input.length !== GUEST_PLAN_DAYS) return null;

  const choices: GuestMealChoiceV1[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const choice = input[index];
    if (
      !isRecord(choice) ||
      choice.date !== addDaysToPlanDate(planStartDate, index) ||
      typeof choice.catalogueMealId !== "string" ||
      !validMealIds.has(choice.catalogueMealId)
    ) {
      return null;
    }
    choices.push({
      date: choice.date,
      catalogueMealId: choice.catalogueMealId,
    });
  }
  return choices;
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
