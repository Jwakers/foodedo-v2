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
 * Calendar “today” in the viewer's local timezone, as YYYY-MM-DD.
 * Plan dates are civil days, not UTC instants.
 */
export function todayPlanDate(now: Date = new Date()): string {
  return formatLocalPlanDate(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  );
}

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

/** e.g. "Wednesday 3 Sep" for an upcoming plan day. */
export function formatPlanDateWithWeekday(date: string): string {
  const parts = parsePlanDateParts(date);
  return `${formatPlanWeekdayLong(date)} ${parts.day} ${shortMonth(parts.month)}`;
}

/**
 * Example: `29 Aug–4 Sep · 6 planned dinners`
 */
export function formatGuestPlanSummary({
  planStartDate,
  planEndDate = addCalendarDays(planStartDate, 6),
  plannedMealCount,
}: {
  planStartDate: string;
  planEndDate?: string;
  plannedMealCount: number;
}): string {
  const dateRange = formatPlanDateRange({
    startDate: planStartDate,
    endDate: planEndDate,
  });
  const dinnerLabel =
    plannedMealCount === 1
      ? "1 planned dinner"
      : `${plannedMealCount} planned dinners`;

  return `${dateRange} · ${dinnerLabel}`;
}

/** Compact civil-date range for Week selectors, e.g. `29 Aug–4 Sep`. */
export function formatPlanDateRange({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}): string {
  const start = parsePlanDateParts(startDate);
  const end = parsePlanDateParts(endDate);
  const startLabel = `${start.day} ${shortMonth(start.month)}`;
  const endLabel =
    start.month === end.month && start.year === end.year
      ? `${end.day} ${shortMonth(end.month)}`
      : `${end.day} ${shortMonth(end.month)}`;

  return `${startLabel}–${endLabel}`;
}

export function formatMealDurationLabel(
  prepMinutes?: number,
  cookMinutes?: number,
): string | null {
  const total = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  if (total <= 0) return null;
  return `${total} min`;
}

export type ActivePlanMealSlot = {
  date: string;
  title: string;
  description: string | null;
  imageSrc: string | null;
  catalogueMealSlug: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  status: "planned" | "cooked" | "skipped";
};

export type ActivePlanFocus = {
  meal: ActivePlanMealSlot;
  /** Overline label without duration, e.g. TONIGHT / TOMORROW / FRIDAY. */
  timingLabel: string;
  durationLabel: string | null;
};

/**
 * Pick the meal to feature on Home: today's planned meal when present,
 * otherwise the next upcoming planned meal in the active week.
 */
export function resolveActivePlanFocus({
  mealSlots,
  today = todayPlanDate(),
}: {
  mealSlots: ReadonlyArray<ActivePlanMealSlot>;
  today?: string;
}): ActivePlanFocus | null {
  const upcoming = mealSlots
    .filter((slot) => slot.status === "planned" && slot.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const meal = upcoming[0];
  if (!meal) return null;

  return {
    meal,
    timingLabel: formatActivePlanTimingLabel(meal.date, today),
    durationLabel: formatMealDurationLabel(
      meal.prepMinutes ?? undefined,
      meal.cookMinutes ?? undefined,
    ),
  };
}

export function resolveActivePlanRestOfWeek({
  mealSlots,
  focusDate,
  today = todayPlanDate(),
}: {
  mealSlots: ReadonlyArray<ActivePlanMealSlot>;
  focusDate: string | null;
  today?: string;
}): ActivePlanMealSlot[] {
  return mealSlots
    .filter(
      (slot) =>
        slot.status === "planned" &&
        slot.date >= today &&
        slot.date !== focusDate,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Full weekday name uppercased for rest-of-week tiles (FRIDAY). */
export function formatPlanWeekdayUpper(date: string): string {
  return formatPlanWeekdayLong(date).toUpperCase();
}

function formatActivePlanTimingLabel(date: string, today: string): string {
  if (date === today) return "TONIGHT";
  if (date === addCalendarDays(today, 1)) return "TOMORROW";
  return formatPlanWeekdayUpper(date);
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
    planEndDate: addCalendarDays(draft.planStartDate, draft.planDays - 1),
    plannedMealCount: countPlannedGuestMeals(draft),
  });
}

export type ActivePlanWeekSlot = {
  date: string;
  status: "planned" | "cooked" | "skipped";
  title: string;
  description: string | null;
  imageSrc: string | null;
  catalogueMealId: string | null;
  catalogueMealSlug: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
};

/**
 * Expand an active plan across its actual date range, inserting empty days
 * only where a date inside that range has no persisted slot.
 */
export function resolveActivePlanWeekRows({
  startDate,
  endDate,
  mealSlots,
  mealsById,
}: {
  startDate: string;
  endDate: string;
  mealSlots: ReadonlyArray<ActivePlanWeekSlot>;
  mealsById: ReadonlyMap<string, CatalogueMeal>;
}): GuestPlanMealRow[] {
  const byDate = new Map(mealSlots.map((slot) => [slot.date, slot] as const));
  const planDays = countPlanDays({ startDate, endDate });
  if (planDays < 1) {
    throw new Error("A plan end date cannot be before its start date.");
  }

  return Array.from({ length: planDays }, (_, index) => {
    const date = addCalendarDays(startDate, index);
    const day = formatPlanDayParts(date);
    const slot = byDate.get(date);

    if (!slot || slot.status === "skipped") {
      return {
        kind: "empty" as const,
        date,
        weekday: day.weekday,
        dayOfMonth: day.dayOfMonth,
      };
    }

    const catalogueMeal =
      slot.catalogueMealId === null
        ? undefined
        : mealsById.get(slot.catalogueMealId);
    const meal: CatalogueMeal = catalogueMeal ?? {
      id: slot.catalogueMealId ?? `slot:${date}`,
      slug: slot.catalogueMealSlug ?? `slot-${date}`,
      title: slot.title,
      description: slot.description ?? undefined,
      imageSrc: slot.imageSrc ?? undefined,
      proteinCategory: "meat-free",
      ingredients: [],
      steps: [],
      prepMinutes: slot.prepMinutes ?? undefined,
      cookMinutes: slot.cookMinutes ?? undefined,
    };

    return {
      kind: "planned" as const,
      date,
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

/** Last two calendar days of the plan — when “Start next plan” may rise. */
export function isNearActivePlanEnd({
  endDate,
  today = todayPlanDate(),
}: {
  endDate: string;
  today?: string;
}): boolean {
  return today >= addCalendarDays(endDate, -1) && today <= endDate;
}

export function formatActivePlanEndSummary({
  endDate,
  dinnersLeft,
}: {
  endDate: string;
  dinnersLeft: number;
}): string {
  const weekday = formatPlanWeekdayShort(endDate);
  const dinnerLabel =
    dinnersLeft === 1 ? "1 dinner left" : `${dinnersLeft} dinners left`;
  return `Ends ${weekday} · ${dinnerLabel}`;
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

export function addCalendarDays(date: string, days: number) {
  const { year, month, day } = parsePlanDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    next.getUTCFullYear().toString().padStart(4, "0"),
    (next.getUTCMonth() + 1).toString().padStart(2, "0"),
    next.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function countPlanDays({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const start = parsePlanDateParts(startDate);
  const end = parsePlanDateParts(endDate);
  const startTime = Date.UTC(start.year, start.month - 1, start.day);
  const endTime = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endTime - startTime) / 86_400_000) + 1;
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
