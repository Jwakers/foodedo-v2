import { addDaysToPlanDate, GUEST_PLAN_DAYS } from "./guest-draft";

const maximumPlanDays = 31;

export type PlanThisMealDay = {
  date: string;
  planned: { catalogueMealId: string | null; title: string } | null;
};

export function nextPlanDay({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}): string | null {
  for (let offset = 0; offset < GUEST_PLAN_DAYS; offset += 1) {
    if (addDaysToPlanDate(startDate, offset) === endDate) {
      return offset + 1 < GUEST_PLAN_DAYS
        ? addDaysToPlanDate(startDate, offset + 1)
        : null;
    }
  }
  return null;
}

/** All slots in the plan, independent of the current date. */
export function planMealOptions({
  startDate,
  endDate,
  slots,
}: {
  startDate: string;
  endDate: string;
  slots: ReadonlyArray<{
    date: string;
    catalogueMealId: string | null;
    title: string;
  }>;
}): PlanThisMealDay[] {
  const slotsByDate = new Map(slots.map((slot) => [slot.date, slot]));
  const days: PlanThisMealDay[] = [];

  for (let offset = 0; offset < maximumPlanDays; offset += 1) {
    const date = addDaysToPlanDate(startDate, offset);
    if (date > endDate) break;
    const slot = slotsByDate.get(date);
    days.push({
      date,
      planned: slot
        ? { catalogueMealId: slot.catalogueMealId, title: slot.title }
        : null,
    });
  }

  return days;
}
