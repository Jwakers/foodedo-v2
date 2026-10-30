import { ConvexError } from "convex/values";
import {
  addDaysToPlanDate,
  isGuestClaimKey,
  isPlanDate,
  isPlanDays,
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
} from "../../../src/lib/domain/guest-draft";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getCatalogueMeal } from "../catalogue";
import { maximumAdjustablePlanDays, minimumAdjustablePlanDays } from "./model";

export function validateProposalRequest({ variant }: { variant: number }) {
  if (!Number.isInteger(variant) || variant < 1 || variant > 100) {
    throwInvalidPlan("The proposal variant is invalid.");
  }
}

export async function validateGuestPlan(
  ctx: QueryCtx | MutationCtx,
  {
    claimKey,
    planStartDate,
    servings,
    mealChoices,
  }: {
    claimKey: string;
    planStartDate: string;
    servings: number;
    mealChoices: Array<{
      date: string;
      catalogueMealId: string | null;
      catalogueVersion: number | null;
    }>;
  },
): Promise<"valid" | "catalogue_unsupported"> {
  if (!isGuestClaimKey(claimKey)) {
    throwInvalidPlan("The plan claim key is invalid.");
  }
  if (!isPlanDate(planStartDate) || !isPlanDays(mealChoices.length)) {
    throwInvalidPlan(
      "The plan must contain between 3 and 7 consecutive dates.",
    );
  }
  if (
    !Number.isInteger(servings) ||
    servings < MINIMUM_PLAN_SERVINGS ||
    servings > MAXIMUM_PLAN_SERVINGS
  ) {
    throwInvalidPlan("The plan serving count is invalid.");
  }

  for (let index = 0; index < mealChoices.length; index += 1) {
    const choice = mealChoices[index]!;
    if (choice.date !== addDaysToPlanDate(planStartDate, index)) {
      throwInvalidPlan("The plan contains an invalid date.");
    }
  }

  let plannedMealCount = 0;
  for (const choice of mealChoices) {
    if (choice.catalogueMealId === null) {
      if (choice.catalogueVersion !== null) {
        throwInvalidPlan("A free day contains a catalogue version.");
      }
      continue;
    }
    if (
      choice.catalogueVersion === null ||
      !Number.isInteger(choice.catalogueVersion) ||
      choice.catalogueVersion < 1
    ) {
      throwInvalidPlan("The plan contains an invalid catalogue meal version.");
    }
    plannedMealCount += 1;
    if (
      (await getCatalogueMeal(
        ctx,
        choice.catalogueMealId,
        choice.catalogueVersion,
      )) === null
    ) {
      return "catalogue_unsupported";
    }
  }
  if (plannedMealCount === 0) {
    throwInvalidPlan("Save at least one dinner before keeping this plan.");
  }

  return "valid";
}

export function throwInvalidPlan(message: string): never {
  throw new ConvexError({ code: "INVALID_GUEST_PLAN", message });
}

export function validateActivePlanAdjustment({
  planDays,
  startDate,
  servings,
}: {
  planDays: number;
  startDate: string;
  servings: number;
}) {
  if (
    !Number.isInteger(planDays) ||
    planDays < minimumAdjustablePlanDays ||
    planDays > maximumAdjustablePlanDays
  ) {
    throwInvalidPlan(
      `A saved plan must span between ${minimumAdjustablePlanDays} and ${maximumAdjustablePlanDays} days.`,
    );
  }
  if (!isPlanDate(startDate)) {
    throwInvalidPlan("The plan start date is invalid.");
  }
  if (
    !Number.isInteger(servings) ||
    servings < MINIMUM_PLAN_SERVINGS ||
    servings > MAXIMUM_PLAN_SERVINGS
  ) {
    throwInvalidPlan(
      `Servings must be between ${MINIMUM_PLAN_SERVINGS} and ${MAXIMUM_PLAN_SERVINGS}.`,
    );
  }
}
