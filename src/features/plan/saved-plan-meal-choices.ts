import {
  addDaysToPlanDate,
  GUEST_PLAN_DAYS,
  isPlanDays,
} from "@/lib/domain/guest-draft";
import { countPlanDays } from "@/lib/domain/plan-display";

export type SavedPlanMealChoice = {
  date: string;
  catalogueMealId: string | null;
};

/** Normalises sparse saved slots into the bounded choices used by local drafts. */
export function savedPlanMealChoices({
  planStartDate,
  planEndDate,
  mealSlots,
}: {
  planStartDate: string;
  planEndDate?: string;
  mealSlots: ReadonlyArray<SavedPlanMealChoice>;
}): SavedPlanMealChoice[] {
  const byDate = new Map(
    mealSlots.map((slot) => [slot.date, slot.catalogueMealId] as const),
  );

  const rangeDays = planEndDate
    ? countPlanDays({ startDate: planStartDate, endDate: planEndDate })
    : GUEST_PLAN_DAYS;
  const planDays = isPlanDays(rangeDays) ? rangeDays : GUEST_PLAN_DAYS;

  return Array.from({ length: planDays }, (_, index) => {
    const date = addDaysToPlanDate(planStartDate, index);
    return {
      date,
      catalogueMealId: byDate.get(date) ?? null,
    };
  });
}
