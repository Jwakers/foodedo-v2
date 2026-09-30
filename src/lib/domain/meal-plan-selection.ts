import type { ProteinCategory } from "./recipes";

export type MealSelectionCandidate = {
  key: string;
  proteinCategory: ProteinCategory;
  isSaved: boolean;
};

export type RecentMealSelectionPlan = {
  candidateKeys: readonly string[];
  proteinCategories: readonly ProteinCategory[];
};

/** The bounded behavioural memory used by the first-pass policy. */
export const MAXIMUM_MEAL_SELECTION_HISTORY_PLANS = 4;

export type MealSelectionRequest = {
  numberOfMeals: number;
  excludedCandidateKeys?: readonly string[];
  recentPlans?: readonly RecentMealSelectionPlan[];
  prioritiseSavedRecipes: boolean;
  variationKey: string;
};

export type MealSelectionContribution = {
  ruleId: string;
  score: number;
  reasonCode: string;
};

export type MealSelectionRuleResult = Omit<MealSelectionContribution, "ruleId">;

export type MealSelectionDecision = {
  candidateKey: string;
  score: number;
  contributions: MealSelectionContribution[];
};

/** Facts available to every rule; rules must remain pure and deterministic. */
export type MealSelectionRuleContext = {
  candidate: MealSelectionCandidate;
  selected: readonly MealSelectionCandidate[];
  request: MealSelectionRequest;
  repeatRequired: boolean;
};

export type MealSelectionRule = {
  id: string;
  evaluate(context: MealSelectionRuleContext): MealSelectionRuleResult | null;
};

const recentPlanPenalties = [-60, -35, -20, -10] as const;

/**
 * Ordered, pure first-pass policy. Add future signals as small rules rather
 * than coupling storage, UI, or Convex code to ranking details.
 */
export const firstPassMealSelectionRules: readonly MealSelectionRule[] = [
  {
    id: "saved-preference",
    evaluate: ({ candidate, request }) =>
      request.prioritiseSavedRecipes && candidate.isSaved
        ? {
            score: 20,
            reasonCode: "saved_recipe_preferred",
          }
        : null,
  },
  {
    id: "new-protein-category",
    evaluate: ({ candidate, selected }) =>
      selected.some(
        (selectedCandidate) =>
          selectedCandidate.proteinCategory === candidate.proteinCategory,
      )
        ? null
        : {
            score: 30,
            reasonCode: "adds_protein_variety",
          },
  },
  {
    id: "recent-plan",
    evaluate: ({ candidate, request }) => {
      const penalty =
        request.recentPlans?.reduce((total, plan, index) => {
          if (!plan.candidateKeys.includes(candidate.key)) return total;
          return total + (recentPlanPenalties[index] ?? 0);
        }, 0) ?? 0;
      return penalty === 0
        ? null
        : {
            score: penalty,
            reasonCode: "recently_planned",
          };
    },
  },
  {
    id: "recent-protein-category",
    evaluate: ({ candidate, request }) => {
      const occurrences =
        request.recentPlans?.reduce(
          (total, plan) =>
            total +
            plan.proteinCategories.filter(
              (proteinCategory) =>
                proteinCategory === candidate.proteinCategory,
            ).length,
          0,
        ) ?? 0;
      const penalty = -Math.min(occurrences * 4, 16);
      return penalty === 0
        ? null
        : {
            score: penalty,
            reasonCode: "protein_recently_overrepresented",
          };
    },
  },
  {
    id: "repeat-fallback",
    evaluate: ({ repeatRequired }) =>
      repeatRequired
        ? {
            score: -100,
            reasonCode: "repeat_required_by_small_pool",
          }
        : null,
  },
];

/** Select a credible plan without reading clocks, storage, or random state. */
export function selectMealPlanCandidates(
  candidates: readonly MealSelectionCandidate[],
  request: MealSelectionRequest,
  rules: readonly MealSelectionRule[] = firstPassMealSelectionRules,
): MealSelectionDecision[] {
  requireCandidates(candidates);
  if (!Number.isInteger(request.numberOfMeals) || request.numberOfMeals < 1) {
    throw new Error("The number of meals must be a positive whole number.");
  }
  if (request.variationKey.trim().length === 0) {
    throw new Error("A selection variation key is required.");
  }

  const normalizedRequest: MealSelectionRequest = {
    ...request,
    recentPlans: request.recentPlans?.slice(
      0,
      MAXIMUM_MEAL_SELECTION_HISTORY_PLANS,
    ),
  };
  const excluded = new Set(request.excludedCandidateKeys ?? []);
  const selected: MealSelectionCandidate[] = [];
  const decisions: MealSelectionDecision[] = [];

  for (let index = 0; index < request.numberOfMeals; index += 1) {
    const selectedKeys = new Set(selected.map((candidate) => candidate.key));
    const unselected = candidates.filter(
      (candidate) => !selectedKeys.has(candidate.key),
    );
    const available = unselected.filter(
      (candidate) => !excluded.has(candidate.key),
    );
    const pool = available.length > 0 ? available : unselected;
    const repeatRequired = pool.length === 0;
    const rankedPool = repeatRequired ? candidates : pool;
    const ranked = rankedPool.map((candidate) => {
      const contributions = rules.flatMap((rule) => {
        const contribution = rule.evaluate({
          candidate,
          selected,
          request: normalizedRequest,
          repeatRequired,
        });
        return contribution === null
          ? []
          : [{ ruleId: rule.id, ...contribution }];
      });
      return {
        candidate,
        contributions,
        score: contributions.reduce(
          (total, contribution) => total + contribution.score,
          0,
        ),
        tieBreaker: stableHash(
          `${request.variationKey}:${index}:${candidate.key}`,
        ),
      };
    });
    ranked.sort(
      (left, right) =>
        right.score - left.score ||
        left.tieBreaker - right.tieBreaker ||
        left.candidate.key.localeCompare(right.candidate.key),
    );
    const winner = ranked[0]!;
    selected.push(winner.candidate);
    decisions.push({
      candidateKey: winner.candidate.key,
      score: winner.score,
      contributions: winner.contributions,
    });
  }

  return decisions;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function requireCandidates(candidates: readonly MealSelectionCandidate[]) {
  if (candidates.length === 0) {
    throw new Error("At least one candidate meal is required.");
  }
  const keys = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.key.trim().length === 0) {
      throw new Error("Candidate meal keys cannot be empty.");
    }
    if (keys.has(candidate.key)) {
      throw new Error("Candidate meal keys must be unique.");
    }
    keys.add(candidate.key);
  }
}
