import { expect, test } from "@playwright/test";
import { createGuestDraft } from "../../src/lib/domain/guest-draft";
import {
  formatGuestPlanSummary,
  formatMealDurationLabel,
  formatPlanDayParts,
  formatPlanWeekdayLong,
  formatPlanWeekdayShort,
  formatProteinCategoryLabel,
  resolveGuestPlanMealRows,
  summarizeGuestPlanDraft,
  tomorrowPlanDate,
} from "../../src/lib/domain/plan-display";
import type { CatalogueMeal } from "../../src/lib/domain/recipes";

test("formats tomorrow as a local calendar plan date", () => {
  expect(tomorrowPlanDate(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-29");
  expect(tomorrowPlanDate(new Date(2026, 11, 31, 8, 0))).toBe("2027-01-01");
});

test("formats day parts and week summary for plan review", () => {
  expect(formatPlanDayParts("2026-08-29")).toEqual({
    weekday: "SAT",
    dayOfMonth: "29",
  });
  expect(formatPlanWeekdayLong("2026-08-29")).toBe("Saturday");
  expect(formatPlanWeekdayShort("2026-08-29")).toBe("Sat");
  expect(formatProteinCategoryLabel("chicken")).toBe("Chicken");
  expect(formatProteinCategoryLabel("meat-free")).toBe("Meat-free");
  expect(
    formatGuestPlanSummary({
      planStartDate: "2026-08-29",
      plannedMealCount: 7,
    }),
  ).toBe("29 Aug–4 Sep · 7 planned dinners");
  expect(
    formatGuestPlanSummary({
      planStartDate: "2026-09-01",
      plannedMealCount: 1,
    }),
  ).toBe("1 Sep–7 Sep · 1 planned dinner");
});

test("resolves draft rows with duration labels when times exist", () => {
  const meals: CatalogueMeal[] = [
    {
      id: "meal-a",
      slug: "meal-a",
      title: "Meal A",
      proteinCategory: "chicken",
      ingredients: [],
      steps: [],
      prepMinutes: 10,
      cookMinutes: 15,
    },
    {
      id: "meal-b",
      slug: "meal-b",
      title: "Meal B",
      proteinCategory: "fish",
      ingredients: [],
      steps: [],
    },
  ];
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const draft = createGuestDraft({
    catalogueVersion: 1,
    planStartDate: "2026-08-29",
    catalogueMealIds: meals.map((meal) => meal.id),
    now: 1,
    emptySlotIndexes: [2],
  });

  const rows = resolveGuestPlanMealRows({ draft, mealsById });

  expect(rows).toHaveLength(7);
  expect(rows[0]).toMatchObject({
    kind: "planned",
    date: "2026-08-29",
    weekday: "SAT",
    dayOfMonth: "29",
    durationLabel: "25 min",
  });
  if (rows[0]?.kind === "planned") {
    expect(rows[0].meal.title).toBe("Meal A");
  }
  expect(rows[2]).toEqual({
    kind: "empty",
    date: "2026-08-31",
    weekday: "MON",
    dayOfMonth: "31",
  });
  expect(summarizeGuestPlanDraft(draft)).toBe(
    "29 Aug–4 Sep · 6 planned dinners",
  );
  expect(formatMealDurationLabel(undefined, undefined)).toBeNull();
  expect(formatMealDurationLabel(20, undefined)).toBe("20 min");
});
