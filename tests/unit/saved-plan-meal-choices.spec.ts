import { expect, test } from "@playwright/test";

import { savedPlanMealChoices } from "../../src/features/plan/saved-plan-meal-choices";

test("normalises sparse saved slots into the saved plan date range", () => {
  const choices = savedPlanMealChoices({
    planStartDate: "2026-08-29",
    mealSlots: [
      { date: "2026-08-29", catalogueMealId: "meal-one" },
      { date: "2026-08-31", catalogueMealId: "meal-three" },
      { date: "2026-09-05", catalogueMealId: "outside-window" },
    ],
  });

  expect(choices).toEqual([
    { date: "2026-08-29", catalogueMealId: "meal-one" },
    { date: "2026-08-30", catalogueMealId: null },
    { date: "2026-08-31", catalogueMealId: "meal-three" },
    { date: "2026-09-01", catalogueMealId: null },
    { date: "2026-09-02", catalogueMealId: null },
    { date: "2026-09-03", catalogueMealId: null },
    { date: "2026-09-04", catalogueMealId: null },
  ]);
});

test("preserves an intermediate six-day saved plan", () => {
  const choices = savedPlanMealChoices({
    planStartDate: "2026-08-29",
    planEndDate: "2026-09-03",
    mealSlots: [{ date: "2026-09-03", catalogueMealId: "meal-six" }],
  });

  expect(choices).toHaveLength(6);
  expect(choices.at(-1)).toEqual({
    date: "2026-09-03",
    catalogueMealId: "meal-six",
  });
});
