import { expect, test } from "@playwright/test";
import { createGuestDraft } from "../../src/lib/domain/guest-draft";
import {
  countPlanDays,
  formatGuestPlanSummary,
  formatMealDurationLabel,
  formatPlanDateRange,
  formatProteinCategoryLabel,
  isNearActivePlanEnd,
  readablePlanMeals,
  resolveActivePlanWeekRows,
  resolveGuestPlanMealRows,
  summarizeGuestPlanDraft,
  todayPlanDate,
  tomorrowPlanDate,
} from "../../src/lib/domain/plan-display";
import type { CatalogueMeal } from "../../src/lib/domain/recipes";

test("formats tomorrow as a local calendar plan date", () => {
  expect(tomorrowPlanDate(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-29");
  expect(tomorrowPlanDate(new Date(2026, 11, 31, 8, 0))).toBe("2027-01-01");
});

test("formats day parts and week summary for plan review", () => {
  expect(
    countPlanDays({ startDate: "2026-08-29", endDate: "2026-09-02" }),
  ).toBe(5);
  expect(formatProteinCategoryLabel("chicken")).toBe("Chicken");
  expect(formatProteinCategoryLabel("turkey")).toBe("Turkey");
  expect(formatProteinCategoryLabel("meat-free")).toBe("Meat-free");
  expect(
    formatPlanDateRange({
      startDate: "2026-08-29",
      endDate: "2026-09-04",
    }),
  ).toBe("29 Aug–4 Sep");
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
      version: 1,
      slug: "meal-a",
      position: 0,
      title: "Meal A",
      proteinCategory: "chicken",
      ingredients: [],
      steps: [],
      prepMinutes: 10,
      cookMinutes: 15,
    },
    {
      id: "meal-b",
      version: 1,
      slug: "meal-b",
      position: 1,
      title: "Meal B",
      proteinCategory: "fish",
      ingredients: [],
      steps: [],
    },
  ];
  const mealsByReference = new Map(
    meals.map((meal) => [`${meal.id}:${meal.version}`, meal]),
  );
  const draft = createGuestDraft({
    planStartDate: "2026-08-29",
    catalogueMeals: meals.map((meal) => ({
      catalogueMealId: meal.id,
      catalogueVersion: meal.version,
    })),
    now: 1,
    emptySlotIndexes: [2],
  });

  const rows = resolveGuestPlanMealRows({ draft, mealsByReference });

  expect(rows).toHaveLength(7);
  expect(rows[0]).toMatchObject({
    kind: "planned",
    date: "2026-08-29",
    durationLabel: "25 min",
  });
  if (rows[0]?.kind === "planned") {
    expect(rows[0].meal.title).toBe("Meal A");
  }
  expect(rows[2]).toEqual({
    kind: "empty",
    requestedServings: draft.servings,
    date: "2026-08-31",
  });
  expect(summarizeGuestPlanDraft(draft)).toBe(
    "29 Aug–4 Sep · 6 planned dinners",
  );
  expect(formatMealDurationLabel(undefined, undefined)).toBeNull();
  expect(formatMealDurationLabel(20, undefined)).toBe("20 min");
});

test("features the first readable meal and lists all others in stable order", () => {
  expect(todayPlanDate(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");

  const meals = [
    {
      date: "2026-08-28",
      title: "Tonight meal",
      description: "Desc",
      imageSrc: null,
      catalogueMealSlug: "tonight",
      prepMinutes: 10,
      cookMinutes: 20,
      status: "planned" as const,
    },
    {
      date: "2026-08-29",
      title: "Tomorrow meal",
      description: null,
      imageSrc: null,
      catalogueMealSlug: "tomorrow",
      prepMinutes: null,
      cookMinutes: 30,
      status: "planned" as const,
    },
    {
      date: "2026-08-30",
      title: "Later meal",
      description: null,
      imageSrc: null,
      catalogueMealSlug: "later",
      prepMinutes: null,
      cookMinutes: null,
      status: "planned" as const,
    },
  ];

  expect(readablePlanMeals(meals)).toEqual(meals);
  const unavailable = {
    ...meals[0]!,
    recipeId: "missing-recipe",
    isAvailable: false,
  };
  const unordered = [meals[2]!, unavailable, meals[1]!];
  expect(readablePlanMeals(unordered)).toEqual([meals[1], meals[2]]);
  expect(readablePlanMeals([unavailable])).toEqual([]);
  expect(readablePlanMeals([{ ...meals[0]!, status: "skipped" }])).toEqual([]);
});

test("fills free days only inside the active plan's date range", () => {
  const mealsByReference = new Map<string, CatalogueMeal>([
    [
      "meal-a:1",
      {
        id: "meal-a",
        version: 1,
        slug: "meal-a",
        position: 0,
        title: "Meal A",
        proteinCategory: "chicken",
        ingredients: [],
        steps: [],
        prepMinutes: 10,
        cookMinutes: 15,
      },
    ],
  ]);

  const rows = resolveActivePlanWeekRows({
    startDate: "2026-08-29",
    endDate: "2026-09-02",
    mealSlots: [
      {
        date: "2026-08-29",
        status: "planned",
        title: "Meal A",
        description: null,
        imageSrc: null,
        catalogueMealId: "meal-a",
        catalogueVersion: 1,
        catalogueMealSlug: "meal-a",
        prepMinutes: 10,
        cookMinutes: 15,
      },
      {
        date: "2026-08-31",
        status: "planned",
        title: "Meal A",
        description: null,
        imageSrc: null,
        catalogueMealId: "meal-a",
        catalogueVersion: 1,
        catalogueMealSlug: "meal-a",
        prepMinutes: 10,
        cookMinutes: 15,
      },
    ],
    mealsByReference,
  });

  expect(rows).toHaveLength(5);
  expect(rows[0]?.kind).toBe("planned");
  expect(rows[1]?.kind).toBe("empty");
  expect(rows[2]?.kind).toBe("planned");
  expect(rows[3]?.kind).toBe("empty");
});

test("detects the end of an active plan for quieter Start next plan", () => {
  expect(
    isNearActivePlanEnd({ endDate: "2026-09-04", today: "2026-09-03" }),
  ).toBe(true);
  expect(
    isNearActivePlanEnd({ endDate: "2026-09-04", today: "2026-09-04" }),
  ).toBe(true);
  expect(
    isNearActivePlanEnd({ endDate: "2026-09-04", today: "2026-09-02" }),
  ).toBe(false);
  expect(
    isNearActivePlanEnd({ endDate: "2026-09-04", today: "2026-10-26" }),
  ).toBe(true);
});
