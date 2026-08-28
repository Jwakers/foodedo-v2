export type MealPlanSelectionInput = {
  candidateMealIds: readonly string[];
  numberOfMeals: number;
  offset: number;
  excludedMealIds?: readonly string[];
};

export type MealPlanSelectionStrategy = (
  input: MealPlanSelectionInput,
) => string[];

/**
 * Transparent MVP strategy. Future preference-aware scoring can replace this
 * function without changing plan storage or the UI mutation contracts.
 */
export const rotatingMealPlanSelectionStrategy: MealPlanSelectionStrategy = ({
  candidateMealIds,
  numberOfMeals,
  offset,
  excludedMealIds = [],
}) => {
  requireCandidates(candidateMealIds);
  if (!Number.isInteger(numberOfMeals) || numberOfMeals < 1) {
    throw new Error("The number of meals must be a positive whole number.");
  }
  if (!Number.isInteger(offset)) {
    throw new Error("The selection offset must be a whole number.");
  }

  const excluded = new Set(excludedMealIds);
  const eligibleMealIds = candidateMealIds.filter((id) => !excluded.has(id));
  const pool =
    eligibleMealIds.length >= numberOfMeals
      ? eligibleMealIds
      : candidateMealIds;
  const startIndex = ((offset % pool.length) + pool.length) % pool.length;

  return Array.from(
    { length: numberOfMeals },
    (_, index) => pool[(startIndex + index) % pool.length]!,
  );
};

export function selectReplacementMeal({
  candidateMealIds,
  currentMealId,
  plannedMealIds,
}: {
  candidateMealIds: readonly string[];
  currentMealId: string;
  plannedMealIds: readonly string[];
}) {
  const currentIndex = candidateMealIds.indexOf(currentMealId);
  if (currentIndex === -1) {
    throw new Error("The current meal is not in the catalogue.");
  }

  return rotatingMealPlanSelectionStrategy({
    candidateMealIds,
    numberOfMeals: 1,
    offset: currentIndex + 1,
    excludedMealIds: plannedMealIds,
  })[0]!;
}

export function createRegenerationSelection({
  candidateMealIds,
  currentMealIds,
  replaceFromIndex,
  variant,
}: {
  candidateMealIds: readonly string[];
  currentMealIds: readonly string[];
  replaceFromIndex: number;
  variant: number;
}) {
  requireCandidates(candidateMealIds);
  if (
    currentMealIds.length === 0 ||
    currentMealIds.some((mealId) => !candidateMealIds.includes(mealId))
  ) {
    throw new Error("Current meals must belong to the candidate catalogue.");
  }
  if (
    !Number.isInteger(replaceFromIndex) ||
    replaceFromIndex < 0 ||
    replaceFromIndex >= currentMealIds.length
  ) {
    throw new Error("The replacement start must be inside the current plan.");
  }
  if (!Number.isInteger(variant) || variant < 1) {
    throw new Error("The proposal variant must be a positive whole number.");
  }

  const preservedMealIds = currentMealIds.slice(0, replaceFromIndex);
  const numberOfReplacements = currentMealIds.length - replaceFromIndex;
  const firstReplaceableMealIndex = candidateMealIds.indexOf(
    currentMealIds[replaceFromIndex]!,
  );
  const replacementMealIds = rotatingMealPlanSelectionStrategy({
    candidateMealIds,
    numberOfMeals: numberOfReplacements,
    offset: firstReplaceableMealIndex + numberOfReplacements * variant,
    excludedMealIds: currentMealIds,
  });

  return [...preservedMealIds, ...replacementMealIds];
}

export function selectRankedPlanCandidates({
  preferredCandidateIds,
  fallbackCandidateIds,
  excludedCandidateIds,
  numberOfMeals,
  variant,
}: {
  preferredCandidateIds: readonly string[];
  fallbackCandidateIds: readonly string[];
  excludedCandidateIds: readonly string[];
  numberOfMeals: number;
  variant: number;
}) {
  const allCandidateIds = [...preferredCandidateIds, ...fallbackCandidateIds];
  requireCandidates(allCandidateIds);
  if (!Number.isInteger(numberOfMeals) || numberOfMeals < 1) {
    throw new Error("The number of meals must be a positive whole number.");
  }
  if (!Number.isInteger(variant) || variant < 1) {
    throw new Error("The proposal variant must be a positive whole number.");
  }

  const excluded = new Set(excludedCandidateIds);
  const preferred = preferredCandidateIds.filter((id) => !excluded.has(id));
  const fallback = fallbackCandidateIds.filter((id) => !excluded.has(id));
  if (preferred.length + fallback.length < numberOfMeals) {
    throw new Error("There are not enough distinct meals for this plan.");
  }

  const preferredSelection = takeRotated(
    preferred,
    Math.min(numberOfMeals, preferred.length),
    (variant - 1) * numberOfMeals,
  );
  const remaining = numberOfMeals - preferredSelection.length;

  return [
    ...preferredSelection,
    ...takeRotated(fallback, remaining, (variant - 1) * numberOfMeals),
  ];
}

function takeRotated(ids: readonly string[], count: number, offset: number) {
  if (count === 0) return [];
  const startIndex = offset % ids.length;
  return Array.from(
    { length: count },
    (_, index) => ids[(startIndex + index) % ids.length]!,
  );
}

function requireCandidates(candidateMealIds: readonly string[]) {
  if (candidateMealIds.length === 0) {
    throw new Error("At least one candidate meal is required.");
  }
  if (candidateMealIds.some((id) => id.trim().length === 0)) {
    throw new Error("Candidate meal IDs cannot be empty.");
  }
  if (new Set(candidateMealIds).size !== candidateMealIds.length) {
    throw new Error("Candidate meal IDs must be unique.");
  }
}
