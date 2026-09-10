import { countPlannedGuestMeals, type GuestDraftV1 } from "./guest-draft";
import type { CatalogueMeal, ProteinCategory } from "./recipes";

export type GuestPlanMealRow = {
  date: string;
  weekday: string;
  dayOfMonth: string;
} & (
  | {
      kind: "planned";
      meal: CatalogueMeal;
      durationLabel: string | null;
    }
  | {
      kind: "empty";
    }
);

/**
 * Calendar “tomorrow” in the viewer's local timezone, as YYYY-MM-DD.
 * Plan dates are civil days, not UTC instants.
 */
export function tomorrowPlanDate(now: Date = new Date()): string {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return formatLocalPlanDate(local);
}

export function formatPlanDayParts(date: string): {
  weekday: string;
  dayOfMonth: string;
} {
  const parts = parsePlanDateParts(date);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return {
    weekday: utc
      .toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
      .toUpperCase(),
    dayOfMonth: parts.day.toString().padStart(2, "0"),
  };
}

/** e.g. "Saturday" for swap sheet titles. */
export function formatPlanWeekdayLong(date: string): string {
  const parts = parsePlanDateParts(date);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return utc.toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

/** e.g. "Sat" for the replacing-meal chip (title case, not uppercase). */
export function formatPlanWeekdayShort(date: string): string {
  const parts = parsePlanDateParts(date);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return utc.toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/**
 * Example: `29 Aug–4 Sep · 6 planned dinners`
 */
export function formatGuestPlanSummary({
  planStartDate,
  plannedMealCount,
}: {
  planStartDate: string;
  plannedMealCount: number;
}): string {
  const start = parsePlanDateParts(planStartDate);
  const endDate = addCalendarDays(planStartDate, 6);
  const end = parsePlanDateParts(endDate);

  const startLabel = `${start.day} ${shortMonth(start.month)}`;
  const endLabel =
    start.month === end.month && start.year === end.year
      ? `${end.day} ${shortMonth(end.month)}`
      : `${end.day} ${shortMonth(end.month)}`;

  const dinnerLabel =
    plannedMealCount === 1
      ? "1 planned dinner"
      : `${plannedMealCount} planned dinners`;

  return `${startLabel}–${endLabel} · ${dinnerLabel}`;
}

export function formatMealDurationLabel(
  prepMinutes?: number,
  cookMinutes?: number,
): string | null {
  const total = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  if (total <= 0) return null;
  return `${total} min`;
}

/** Display label for catalogue protein categories (e.g. meat-free → Meat-free). */
export function formatProteinCategoryLabel(category: ProteinCategory): string {
  if (category === "meat-free") return "Meat-free";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function resolveGuestPlanMealRows({
  draft,
  mealsById,
}: {
  draft: GuestDraftV1;
  mealsById: ReadonlyMap<string, CatalogueMeal>;
}): GuestPlanMealRow[] {
  return draft.mealChoices.map((choice) => {
    const day = formatPlanDayParts(choice.date);

    if (choice.catalogueMealId === null) {
      return {
        kind: "empty" as const,
        date: choice.date,
        weekday: day.weekday,
        dayOfMonth: day.dayOfMonth,
      };
    }

    const meal = mealsById.get(choice.catalogueMealId);
    if (!meal) {
      throw new Error(`Unknown catalogue meal: ${choice.catalogueMealId}`);
    }

    return {
      kind: "planned" as const,
      date: choice.date,
      weekday: day.weekday,
      dayOfMonth: day.dayOfMonth,
      meal,
      durationLabel: formatMealDurationLabel(
        meal.prepMinutes,
        meal.cookMinutes,
      ),
    };
  });
}

export function summarizeGuestPlanDraft(draft: GuestDraftV1) {
  return formatGuestPlanSummary({
    planStartDate: draft.planStartDate,
    plannedMealCount: countPlannedGuestMeals(draft),
  });
}

function formatLocalPlanDate(date: Date) {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function parsePlanDateParts(date: string) {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error("Plan date must use YYYY-MM-DD.");
  }
  return { year, month, day };
}

function addCalendarDays(date: string, days: number) {
  const { year, month, day } = parsePlanDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    next.getUTCFullYear().toString().padStart(4, "0"),
    (next.getUTCMonth() + 1).toString().padStart(2, "0"),
    next.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function shortMonth(month: number) {
  return SHORT_MONTHS[month - 1]!;
}
