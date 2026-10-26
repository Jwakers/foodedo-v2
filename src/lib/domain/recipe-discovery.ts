import type { CatalogueMealSummary } from "./recipes";

type DiscoveryCandidate = Pick<
  CatalogueMealSummary,
  "id" | "proteinCategory" | "prepMinutes" | "cookMinutes" | "costBand"
>;
const discoverySize = 6;
const proteinWeight = 3;
const repeatProteinPenalty = 6; // Greater than the maximum affinity score (5).

/** Discovery is deliberately separate from planning: saved meals are exclusions. */
export function selectDiscoveryMeals<T extends DiscoveryCandidate>(
  meals: readonly T[],
  {
    savedMealIds,
    plannedMealIds,
    day,
    viewerKey,
  }: {
    savedMealIds: ReadonlySet<string>;
    plannedMealIds: ReadonlySet<string>;
    day: string;
    viewerKey: string;
  },
): T[] {
  const uniqueMeals = [
    ...new Map(meals.map((meal) => [meal.id, meal])).values(),
  ];
  const favourites = uniqueMeals.filter((meal) => savedMealIds.has(meal.id));
  const proteins = frequencies(favourites.map((meal) => meal.proteinCategory));
  const durations = frequencies(favourites.map(durationBand));
  const costs = frequencies(favourites.map((meal) => meal.costBand));
  const pool = uniqueMeals
    .filter(
      (meal) => !savedMealIds.has(meal.id) && !plannedMealIds.has(meal.id),
    )
    .map((meal) => ({
      meal,
      // Unknown metadata never counts as a match. Normalising by library size
      // keeps taste a gentle preference regardless of how many meals are saved.
      affinity:
        favourites.length === 0
          ? 0
          : (proteinWeight * (proteins.get(meal.proteinCategory) ?? 0) +
              (durations.get(durationBand(meal)) ?? 0) +
              (costs.get(meal.costBand) ?? 0)) /
            favourites.length,
    }));
  const selected: T[] = [];
  const selectedProteins = new Map<string, number>();

  while (pool.length > 0 && selected.length < discoverySize) {
    const seed = `${viewerKey}:${day}:${selected.length}`;
    const explorationSlot = selected.length % 3 === 2;
    let winnerIndex = 0;
    let bestScore = -Infinity;
    let bestTieBreaker = Infinity;
    for (const [index, { meal, affinity }] of pool.entries()) {
      const score =
        (explorationSlot ? 0 : affinity) -
        (selectedProteins.get(meal.proteinCategory) ?? 0) *
          repeatProteinPenalty;
      const tieBreaker = stableHash(`${seed}:${meal.id}`);
      if (
        score > bestScore ||
        (score === bestScore &&
          (tieBreaker < bestTieBreaker ||
            (tieBreaker === bestTieBreaker &&
              meal.id.localeCompare(pool[winnerIndex]!.meal.id) < 0)))
      ) {
        winnerIndex = index;
        bestScore = score;
        bestTieBreaker = tieBreaker;
      }
    }
    const { meal } = pool.splice(winnerIndex, 1)[0]!;
    selected.push(meal);
    selectedProteins.set(
      meal.proteinCategory,
      (selectedProteins.get(meal.proteinCategory) ?? 0) + 1,
    );
  }
  return selected;
}

function frequencies<T>(values: readonly (T | null | undefined)[]) {
  const counts = new Map<T | null | undefined, number>();
  for (const value of values) {
    if (value !== null && value !== undefined)
      counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function durationBand(meal: DiscoveryCandidate): number | null {
  if (meal.prepMinutes === undefined && meal.cookMinutes === undefined)
    return null;
  const total = (meal.prepMinutes ?? 0) + (meal.cookMinutes ?? 0);
  return total <= 30 ? 0 : total <= 60 ? 1 : 2;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}
