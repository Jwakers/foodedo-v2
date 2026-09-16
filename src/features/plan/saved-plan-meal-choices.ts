import { addDaysToPlanDate, GUEST_PLAN_DAYS } from "@/lib/domain/guest-draft";

export type SavedPlanMealChoice = {
  date: string;
  catalogueMealId: string | null;
};

/** Normalises sparse saved slots into the seven choices used by local drafts. */
export function savedPlanMealChoices({
  planStartDate,
  mealSlots,
}: {
  planStartDate: string;
  mealSlots: ReadonlyArray<SavedPlanMealChoice>;
}): SavedPlanMealChoice[] {
  const byDate = new Map(
    mealSlots.map((slot) => [slot.date, slot.catalogueMealId] as const),
  );

  return Array.from({ length: GUEST_PLAN_DAYS }, (_, index) => {
    const date = addDaysToPlanDate(planStartDate, index);
    return {
      date,
      catalogueMealId: byDate.get(date) ?? null,
    };
  });
}
