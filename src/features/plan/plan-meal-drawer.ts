/** Stable view ids for the meal-actions drawer stack. */
export const planMealDrawerViews = {
  actions: "actions",
  swap: "swap",
  filters: "filters",
  preview: "preview",
} as const;

export type PlanMealDrawerViewId =
  (typeof planMealDrawerViews)[keyof typeof planMealDrawerViews];
