import { expect, test } from "@playwright/test";

import {
  MAXIMUM_MEAL_SELECTION_HISTORY_PLANS,
  selectMealPlanCandidates,
  type MealSelectionCandidate,
  type MealSelectionRule,
} from "../../src/lib/domain/meal-plan-selection";

const candidates: MealSelectionCandidate[] = [
  { key: "chicken", proteinCategory: "chicken", isSaved: false },
  { key: "beef", proteinCategory: "beef", isSaved: false },
  { key: "fish", proteinCategory: "fish", isSaved: false },
  { key: "beans", proteinCategory: "meat-free", isSaved: true },
];

function select(
  overrides: Partial<Parameters<typeof selectMealPlanCandidates>[1]> = {},
  pool = candidates,
) {
  return selectMealPlanCandidates(pool, {
    numberOfMeals: 3,
    prioritiseSavedRecipes: false,
    variationKey: "test-plan",
    ...overrides,
  });
}

test("is stable for the same request and surfaces its rule contributions", () => {
  const first = select();
  expect(select()).toEqual(first);
  expect(first[0]!.contributions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: "new-protein-category",
        score: 30,
      }),
    ]),
  );
});

test("uses the saved preference without making it a hard queue", () => {
  const decisions = select({ numberOfMeals: 2, prioritiseSavedRecipes: true }, [
    { key: "saved-chicken", proteinCategory: "chicken", isSaved: true },
    { key: "standard-chicken", proteinCategory: "chicken", isSaved: false },
    { key: "standard-fish", proteinCategory: "fish", isSaved: false },
  ]);
  expect(decisions.map((decision) => decision.candidateKey)).toEqual(
    expect.arrayContaining(["saved-chicken", "standard-fish"]),
  );
});

test("penalizes exact recipes and proteins across four recent plans", () => {
  const decisions = select({
    numberOfMeals: 1,
    recentPlans: [
      { candidateKeys: ["chicken"], proteinCategories: ["chicken"] },
      { candidateKeys: ["beef"], proteinCategories: ["beef"] },
      { candidateKeys: ["fish"], proteinCategories: ["fish"] },
      { candidateKeys: ["beans"], proteinCategories: ["meat-free"] },
    ],
  });
  expect(decisions[0]!.candidateKey).toBe("beans");
  expect(decisions[0]!.contributions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ruleId: "recent-plan", score: -10 }),
    ]),
  );
});

test("avoids A-B cycles when an unplanned alternative exists", () => {
  const decisions = select({
    numberOfMeals: 1,
    recentPlans: [
      { candidateKeys: ["chicken"], proteinCategories: ["chicken"] },
      { candidateKeys: ["beef"], proteinCategories: ["beef"] },
    ],
  });
  expect(["fish", "beans"]).toContain(decisions[0]!.candidateKey);
});

test("relaxes exclusions before repeating and repeats only as a final fallback", () => {
  const twoMeals = candidates.slice(0, 2);
  const decisions = select(
    {
      numberOfMeals: 3,
      excludedCandidateKeys: ["chicken", "beef"],
    },
    twoMeals,
  );
  expect(
    new Set(decisions.slice(0, 2).map((decision) => decision.candidateKey))
      .size,
  ).toBe(2);
  expect(decisions[2]!.contributions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ruleId: "repeat-fallback", score: -100 }),
    ]),
  );
});

test("variation keys only resolve otherwise equivalent candidates", () => {
  const equalCandidates: MealSelectionCandidate[] = [
    { key: "a", proteinCategory: "chicken", isSaved: false },
    { key: "b", proteinCategory: "chicken", isSaved: false },
  ];
  const outcomes = new Set(
    ["one", "two", "three", "four"].map(
      (variationKey) =>
        select({ numberOfMeals: 1, variationKey }, equalCandidates)[0]!
          .candidateKey,
    ),
  );
  expect(outcomes.size).toBeGreaterThan(1);
});

test("accepts independently composed rules with their own decision metadata", () => {
  const preferBeef: MealSelectionRule = {
    id: "test-prefer-beef",
    evaluate: ({ candidate }) =>
      candidate.key === "beef"
        ? {
            score: 100,
            reasonCode: "test_preference",
          }
        : null,
  };

  const [decision] = selectMealPlanCandidates(
    candidates,
    {
      numberOfMeals: 1,
      prioritiseSavedRecipes: false,
      variationKey: "custom-rule",
    },
    [preferBeef],
  );

  expect(decision).toMatchObject({
    candidateKey: "beef",
    contributions: [
      { ruleId: "test-prefer-beef", score: 100, reasonCode: "test_preference" },
    ],
  });
});

test("ignores history older than the bounded four-plan memory", () => {
  const [decision] = select(
    {
      numberOfMeals: 1,
      recentPlans: Array.from(
        { length: MAXIMUM_MEAL_SELECTION_HISTORY_PLANS + 1 },
        (_, index) =>
          index === MAXIMUM_MEAL_SELECTION_HISTORY_PLANS
            ? { candidateKeys: ["only"], proteinCategories: ["chicken"] }
            : { candidateKeys: [], proteinCategories: [] },
      ),
    },
    [{ key: "only", proteinCategory: "chicken", isSaved: false }],
  );

  expect(decision!.contributions).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ruleId: "recent-plan" }),
    ]),
  );
  expect(decision!.contributions).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ruleId: "recent-protein-category" }),
    ]),
  );
});
