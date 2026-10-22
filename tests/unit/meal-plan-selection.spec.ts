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

test("shared favourites beat individual favourites and duplicate member keys are not extra votes", () => {
  const pool: MealSelectionCandidate[] = [
    {
      key: "shared",
      proteinCategory: "chicken",
      isSaved: true,
      savedByMemberKeys: ["a", "b"],
    },
    {
      key: "solo",
      proteinCategory: "chicken",
      isSaved: true,
      savedByMemberKeys: ["a", "a", "a"],
    },
  ];
  const [first, second] = select(
    { numberOfMeals: 2, prioritiseSavedRecipes: true },
    pool,
  );
  expect(first!.candidateKey).toBe("shared");
  expect(first!.contributions).toContainEqual({
    ruleId: "household-consensus",
    score: 10,
    reasonCode: "shared_household_favourite",
  });
  expect(
    second!.contributions.some((rule) => rule.ruleId === "household-consensus"),
  ).toBe(false);
});

test("a large saved library does not crowd out another member's favourites", () => {
  const pool: MealSelectionCandidate[] = Array.from({ length: 30 }, (_, i) => ({
    key: `a-${i}`,
    proteinCategory: "chicken",
    isSaved: true,
    savedByMemberKeys: ["a"],
  }));
  pool.push({
    key: "b-only",
    proteinCategory: "chicken",
    isSaved: true,
    savedByMemberKeys: ["b"],
  });
  for (let i = 0; i < 20; i++) {
    const decisions = select(
      {
        numberOfMeals: 7,
        prioritiseSavedRecipes: true,
        variationKey: `balanced-${i}`,
      },
      pool,
    );
    expect(decisions.slice(0, 2).map((d) => d.candidateKey)).toContain(
      "b-only",
    );
  }
});

test("dismissal is a small capped penalty and never excludes a meal", () => {
  const pool: MealSelectionCandidate[] = [
    {
      key: "dismissed",
      proteinCategory: "chicken",
      isSaved: false,
      dismissalCount: 100,
    },
    { key: "fresh", proteinCategory: "chicken", isSaved: false },
  ];
  const decisions = select({ numberOfMeals: 3 }, pool);
  expect(decisions[0]!.candidateKey).toBe("fresh");
  const dismissed = decisions.find((d) => d.candidateKey === "dismissed")!;
  expect(dismissed.contributions).toContainEqual({
    ruleId: "dismissal-feedback",
    score: -18,
    reasonCode: "previously_dismissed",
  });
  expect(decisions).toHaveLength(3);
});

test("switching saved preference off disables both household rules, but keeps rejection feedback", () => {
  const [decision] = select({ numberOfMeals: 1 }, [
    {
      key: "only",
      proteinCategory: "chicken",
      isSaved: true,
      savedByMemberKeys: ["a", "b"],
      dismissalCount: 1,
    },
  ]);
  expect(decision!.contributions.map((c) => c.ruleId)).toEqual([
    "dismissal-feedback",
    "new-protein-category",
  ]);
});

test("recent-meal memory can outweigh a shared favourite", () => {
  const [decision] = select(
    {
      numberOfMeals: 1,
      prioritiseSavedRecipes: true,
      recentPlans: [
        { candidateKeys: ["shared"], proteinCategories: ["chicken"] },
      ],
    },
    [
      {
        key: "shared",
        proteinCategory: "chicken",
        isSaved: true,
        savedByMemberKeys: ["a", "b"],
      },
      { key: "fresh", proteinCategory: "chicken", isSaved: false },
    ],
  );
  expect(decision!.candidateKey).toBe("fresh");
});

test("single-meal choices balance the meals already staying in the plan", () => {
  const retained: MealSelectionCandidate = {
    key: "retained-a",
    proteinCategory: "chicken",
    isSaved: true,
    savedByMemberKeys: ["a"],
  };
  const decisions = select(
    {
      numberOfMeals: 1,
      prioritiseSavedRecipes: true,
      retainedCandidates: [retained, retained],
    },
    [
      {
        key: "another-a",
        proteinCategory: "chicken",
        isSaved: true,
        savedByMemberKeys: ["a"],
      },
      {
        key: "first-b",
        proteinCategory: "chicken",
        isSaved: true,
        savedByMemberKeys: ["b"],
      },
    ],
  );
  expect(decisions.map((decision) => decision.candidateKey)).toEqual([
    "first-b",
  ]);
  expect(
    decisions[0]!.contributions.some(
      (rule) => rule.ruleId === "new-protein-category",
    ),
  ).toBe(false);
});
