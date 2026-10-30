import { v } from "convex/values";

export const mealSlotViewValidator = v.object({
  servings: v.optional(v.number()),
  minimumServings: v.optional(v.number()),
  servingScaling: v.optional(
    v.union(v.literal("safe"), v.literal("source_only")),
  ),
  _id: v.id("mealSlots"),
  date: v.string(),
  recipeId: v.id("recipes"),
  isAvailable: v.boolean(),
  catalogueMealId: v.union(v.string(), v.null()),
  catalogueVersion: v.union(v.number(), v.null()),
  catalogueMealSlug: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  imageSrc: v.union(v.string(), v.null()),
  prepMinutes: v.union(v.number(), v.null()),
  cookMinutes: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("planned"),
    v.literal("cooked"),
    v.literal("skipped"),
  ),
});

export const mealPlanViewValidator = v.object({
  _id: v.id("mealPlans"),
  startDate: v.string(),
  endDate: v.string(),
  servings: v.number(),
  updatedAt: v.number(),
  status: v.union(v.literal("active"), v.literal("archived")),
  hasActivePlanConflict: v.boolean(),
  mealSlots: v.array(mealSlotViewValidator),
});

export const archivedMealPlanSummaryValidator = v.object({
  _id: v.id("mealPlans"),
  startDate: v.string(),
  endDate: v.string(),
  status: v.literal("archived"),
});

export const mealChoiceValidator = v.object({
  date: v.string(),
  // Null keeps a free day in the bounded plan window without creating a slot.
  catalogueMealId: v.union(v.string(), v.null()),
  catalogueVersion: v.union(v.number(), v.null()),
});

export const claimResultValidator = v.union(
  v.object({
    status: v.literal("claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({
    status: v.literal("already_claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({ status: v.literal("catalogue_unsupported") }),
);

export const swapResultValidator = v.union(
  v.object({ status: v.literal("swapped") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

export const planMealResultValidator = v.union(
  v.object({ status: v.literal("planned") }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
  v.object({ status: v.literal("catalogue_unsupported") }),
);

export const addPlanDayResultValidator = v.union(
  v.object({ status: v.literal("planned"), date: v.string() }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_full") }),
  v.object({ status: v.literal("plan_unavailable") }),
  v.object({ status: v.literal("catalogue_unsupported") }),
);

export const proposalMealSlotValidator = v.object({
  servingNotice: v.optional(v.string()),
  previousTitle: v.string(),
  date: v.string(),
  catalogueMealId: v.union(v.string(), v.null()),
  catalogueMealSlug: v.union(v.string(), v.null()),
  title: v.string(),
  prepMinutes: v.union(v.number(), v.null()),
  cookMinutes: v.union(v.number(), v.null()),
  isChanged: v.boolean(),
});

export const regenerationProposalResultValidator = v.union(
  v.object({
    status: v.literal("ready"),
    sourcePlanId: v.id("mealPlans"),
    sourceUpdatedAt: v.number(),
    variant: v.number(),
    mealSlots: v.array(proposalMealSlotValidator),
  }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

export const applyProposalResultValidator = v.union(
  v.object({
    status: v.literal("applied"),
    mealPlanId: v.id("mealPlans"),
    previousMealPlanId: v.id("mealPlans"),
    currentUpdatedAt: v.number(),
  }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

export const undoReplacementResultValidator = v.union(
  v.object({ status: v.literal("restored") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("plan_changed") }),
);

export const resolveActivePlanConflictResultValidator = v.union(
  v.object({ status: v.literal("resolved") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("too_many_active_plans") }),
);

export const adjustActivePlanResultValidator = v.union(
  v.object({
    status: v.literal("adjusted"),
    addedDays: v.number(),
    removedDates: v.array(v.string()),
  }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
);
