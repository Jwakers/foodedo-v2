import { countPlannedGuestMeals, type GuestDraft } from "./guest-draft";
import {
  catalogueMealReferenceKey,
  type CatalogueMealSummary,
  type ProteinCategory,
} from "./recipes";

export type GuestPlanMealRow = {
  date: string;
  requestedServings?: number;
} & (
  | {
      kind: "planned";
      meal: CatalogueMealSummary;
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
  _id?: string;
  isAvailable?: boolean;
  recipeId?: string;
  date: string;
  title: string;
  description: string | null;
  imageSrc: string | null;
  catalogueMealId?: string | null;
  catalogueVersion?: number | null;
  catalogueMealSlug: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  status: "planned" | "cooked" | "skipped";
};

/** Dates order slots; they never determine which meals are available. */
export function readablePlanMeals(
  mealSlots: ReadonlyArray<ActivePlanMealSlot>,
): ActivePlanMealSlot[] {
  return mealSlots
    .filter(
      (slot) =>
        slot.status !== "skipped" &&
        slot.isAvailable !== false &&
        Boolean(slot.recipeId || slot.catalogueMealSlug),
    )
    .toSorted((a, b) => a.date.localeCompare(b.date));
}

/** Display label for catalogue protein categories (e.g. meat-free → Meat-free). */
export function formatProteinCategoryLabel(category: ProteinCategory): string {
  if (category === "meat-free") return "Meat-free";
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function resolveGuestPlanMealRows({
  draft,
  mealsByReference,
}: {
  draft: GuestDraft;
  mealsByReference: ReadonlyMap<string, CatalogueMealSummary>;
}): GuestPlanMealRow[] {
  return draft.mealChoices.map((choice) => {
    if (choice.catalogueMealId === null) {
      return {
        kind: "empty" as const,
        requestedServings: draft.servings,
        date: choice.date,
      };
    }
    if (choice.catalogueVersion === null) {
      throw new Error(
        `Catalogue meal is missing its revision: ${choice.catalogueMealId}`,
      );
    }

    const meal = mealsByReference.get(
      catalogueMealReferenceKey({
        catalogueMealId: choice.catalogueMealId,
        catalogueVersion: choice.catalogueVersion,
      }),
    );
    if (!meal) {
      throw new Error(`Unknown catalogue meal: ${choice.catalogueMealId}`);
    }

    return {
      kind: "planned" as const,
      date: choice.date,
      meal,
      requestedServings: draft.servings,
      durationLabel: formatMealDurationLabel(
        meal.prepMinutes,
        meal.cookMinutes,
      ),
    };
  });
}

export function summarizeGuestPlanDraft(draft: GuestDraft) {
  return formatGuestPlanSummary({
    planStartDate: draft.planStartDate,
    planEndDate: addCalendarDays(draft.planStartDate, draft.planDays - 1),
    plannedMealCount: countPlannedGuestMeals(draft),
  });
}

export type ActivePlanWeekSlot = {
  servings?: number;
  minimumServings?: number;
  servingScaling?: "safe" | "source_only";
  date: string;
  status: "planned" | "cooked" | "skipped";
  title: string;
  description: string | null;
  imageSrc: string | null;
  catalogueMealId: string | null;
  catalogueVersion: number | null;
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
  mealsByReference,
  mealsById,
  servings,
}: {
  startDate: string;
  endDate: string;
  mealSlots: ReadonlyArray<ActivePlanWeekSlot>;
  mealsByReference: ReadonlyMap<string, CatalogueMealSummary>;
  mealsById?: ReadonlyMap<string, CatalogueMealSummary>;
  servings?: number;
}): GuestPlanMealRow[] {
  const byDate = new Map(mealSlots.map((slot) => [slot.date, slot] as const));
  const planDays = countPlanDays({ startDate, endDate });
  if (planDays < 1) {
    throw new Error("A plan end date cannot be before its start date.");
  }

  return Array.from({ length: planDays }, (_, index) => {
    const date = addCalendarDays(startDate, index);
    const slot = byDate.get(date);

    if (!slot || slot.status === "skipped") {
      return {
        kind: "empty" as const,
        requestedServings: servings,
        date,
      };
    }

    const catalogueMeal =
      slot.catalogueMealId === null
        ? undefined
        : slot.catalogueVersion !== null
          ? mealsByReference.get(
              catalogueMealReferenceKey({
                catalogueMealId: slot.catalogueMealId,
                catalogueVersion: slot.catalogueVersion,
              }),
            )
          : mealsById?.get(slot.catalogueMealId);
    const fallbackMeal: CatalogueMealSummary = catalogueMeal ?? {
      id: slot.catalogueMealId ?? `slot:${date}`,
      version: slot.catalogueVersion ?? 1,
      slug: slot.catalogueMealSlug ?? `slot-${date}`,
      position: 0,
      title: slot.title,
      description: slot.description ?? undefined,
      imageSrc: slot.imageSrc ?? undefined,
      proteinCategory: "meat-free",
      prepMinutes: slot.prepMinutes ?? undefined,
      cookMinutes: slot.cookMinutes ?? undefined,
    };

    const meal = {
      ...fallbackMeal,
      servings: slot.servings,
      minimumServings: slot.minimumServings,
      servingScaling: slot.servingScaling,
    };
    return {
      kind: "planned" as const,
      date,
      meal,
      requestedServings: servings,
      durationLabel: formatMealDurationLabel(
        meal.prepMinutes,
        meal.cookMinutes,
      ),
    };
  });
}

/** A gentle next-plan cue, beginning the day before the range ends. */
export function isNearActivePlanEnd({
  endDate,
  today = todayPlanDate(),
}: {
  endDate: string;
  today?: string;
}): boolean {
  return today >= addCalendarDays(endDate, -1);
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
