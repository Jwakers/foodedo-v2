import { expect, test } from "@playwright/test";
import { createGuestDraft } from "../../src/lib/domain/guest-draft";
import {
  formatGuestPlanSummary,
  formatMealDurationLabel,
  formatPlanDayParts,
  formatPlanDateRange,
  formatPlanWeekdayLong,
  formatPlanWeekdayShort,
  formatProteinCategoryLabel,
  formatActivePlanEndSummary,
  isNearActivePlanEnd,
  resolveActivePlanFocus,
  resolveActivePlanRestOfWeek,
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
  expect(formatPlanDayParts("2026-08-29")).toEqual({
    weekday: "SAT",
    dayOfMonth: "29",
  });
  expect(formatPlanWeekdayLong("2026-08-29")).toBe("Saturday");
  expect(formatPlanWeekdayShort("2026-08-29")).toBe("Sat");
  expect(formatProteinCategoryLabel("chicken")).toBe("Chicken");
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

test("features tonight or the next upcoming planned meal", () => {
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

  const focus = resolveActivePlanFocus({
    mealSlots: meals,
    today: "2026-08-28",
  });
  expect(focus?.timingLabel).toBe("TONIGHT");
  expect(focus?.durationLabel).toBe("30 min");
  expect(focus?.meal.title).toBe("Tonight meal");

  const rest = resolveActivePlanRestOfWeek({
    mealSlots: meals,
    focusDate: focus?.meal.date ?? null,
    today: "2026-08-28",
  });
  expect(rest.map((meal) => meal.title)).toEqual([
    "Tomorrow meal",
    "Later meal",
  ]);

  const tomorrowFocus = resolveActivePlanFocus({
    mealSlots: meals.slice(1),
    today: "2026-08-28",
  });
  expect(tomorrowFocus?.timingLabel).toBe("TOMORROW");
});

test("fills free days when resolving an active week list", () => {
  const mealsById = new Map<string, CatalogueMeal>([
    [
      "meal-a",
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
    ],
  ]);

  const rows = resolveActivePlanWeekRows({
    startDate: "2026-08-29",
    mealSlots: [
      {
        date: "2026-08-29",
        status: "planned",
        title: "Meal A",
        description: null,
        imageSrc: null,
        catalogueMealId: "meal-a",
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
        catalogueMealSlug: "meal-a",
        prepMinutes: 10,
        cookMinutes: 15,
      },
    ],
    mealsById,
  });

  expect(rows).toHaveLength(7);
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
    formatActivePlanEndSummary({ endDate: "2026-09-04", dinnersLeft: 2 }),
  ).toBe("Ends Fri · 2 dinners left");
});
