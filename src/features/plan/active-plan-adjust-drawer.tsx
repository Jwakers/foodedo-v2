"use client";
import { useHouseholdSpace } from "@/features/household/household-context";

import { useMutation } from "convex/react";
import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  DietaryPreferencesStub,
  PlanCounterButton,
  PlanScopeOption,
} from "@/features/plan/plan-adjustment-controls";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  isPlanDayOption,
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
  PLAN_DAY_OPTIONS,
  planDatesRemovedByShortening,
} from "@/lib/domain/guest-draft";
import { countPlanDays } from "@/lib/domain/plan-display";

type ChangeScope = "this-plan" | "future";

type AdjustablePlan = {
  _id: string;
  startDate: string;
  endDate: string;
  servings: number;
  updatedAt: number;
};

export function ActivePlanAdjustDrawer({
  plan,
  disabled,
}: {
  plan: AdjustablePlan;
  disabled: boolean;
}) {
  const { spaceArgs } = useHouseholdSpace();
  const adjustActivePlan = useMutation(api.mealPlans.adjustActivePlan);
  const [open, setOpen] = useState(false);
  const [reviewedPlan, setReviewedPlan] = useState(plan);
  // The form and its explanation must use the same revision as the write.
  // A partner's live edits are rejected on apply, rather than retargeting it.
  const baseline = open ? reviewedPlan : plan;
  const initialDays = countPlanDays({
    startDate: baseline.startDate,
    endDate: baseline.endDate,
  });
  const visiblePlanDayOptions = isPlanDayOption(initialDays)
    ? PLAN_DAY_OPTIONS
    : [...PLAN_DAY_OPTIONS, initialDays].toSorted((a, b) => a - b);
  const [planDays, setPlanDays] = useState(initialDays);
  const [startDate, setStartDate] = useState(plan.startDate);
  const [servings, setServings] = useState(plan.servings);
  const [scope, setScope] = useState<ChangeScope>("this-plan");
  const [isApplying, setIsApplying] = useState(false);

  const hasChanges =
    planDays !== initialDays ||
    startDate !== baseline.startDate ||
    servings !== baseline.servings;
  const removedDates = planDatesRemovedByShortening({
    startDate: baseline.startDate,
    currentPlanDays: initialDays,
    nextPlanDays: planDays,
  });

  function resetForm(source = baseline) {
    setPlanDays(countPlanDays(source));
    setStartDate(source.startDate);
    setServings(source.servings);
    setScope("this-plan");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setReviewedPlan(plan);
      resetForm(plan);
    }
    setOpen(nextOpen);
  }

  async function applyChanges() {
    if (!hasChanges || isApplying) {
      setOpen(false);
      return;
    }

    setIsApplying(true);
    try {
      const result = await adjustActivePlan({
        ...spaceArgs,
        mealPlanId: reviewedPlan._id as Id<"mealPlans">,
        expectedUpdatedAt: reviewedPlan.updatedAt,
        planDays,
        startDate,
        servings,
        persistForFuture: scope === "future",
      });

      switch (result.status) {
        case "adjusted":
          setOpen(false);
          toast.success("Plan adjusted", {
            description:
              result.addedDays > 0
                ? `${result.addedDays} ${result.addedDays === 1 ? "day was" : "days were"} added without changing your existing meals.`
                : "Your existing meals were preserved wherever they still fit.",
          });
          return;
        case "plan_changed":
          toast.info("Your plan changed while this drawer was open.", {
            description:
              "Close and reopen Edit this week to use the latest version.",
          });
          return;
        case "no_active_plan":
          toast.error("There is no active plan to adjust.");
          setOpen(false);
          return;
        case "plan_unavailable":
          toast.error("Foodedo couldn’t safely adjust this plan.", {
            description: "Your current plan has not been changed.",
          });
          return;
        default: {
          const _exhaustive: never = result;
          void _exhaustive;
        }
      }
    } catch (error) {
      console.error("Failed to adjust the active plan.", error);
      toast.error("Foodedo couldn’t adjust your plan. Try again.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <Button
          variant="inline"
          className="min-h-11 shrink-0 text-13 font-semibold leading-5 text-leaf"
          disabled={disabled}
        >
          Edit this week
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DrawerTitle>Edit this saved week</DrawerTitle>
            <DrawerDescription>
              These changes update your current week. Existing meals stay in
              place wherever they still fit.
            </DrawerDescription>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="inline"
              size="headerIcon"
              className="w-auto px-2 text-graphite"
              disabled={!hasChanges || isApplying}
              onClick={() => resetForm()}
            >
              Reset
            </Button>
            <DrawerClose asChild>
              <Button
                variant="quiet"
                size="headerIcon"
                aria-label="Close adjustments"
                className="text-ink"
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <DrawerBody className="flex flex-col pb-4">
          <fieldset className="flex flex-col gap-2.5 pb-3.5">
            <legend className="mb-2.5 text-14 font-semibold text-ink">
              How many days?
            </legend>
            <div className="flex gap-2">
              {visiblePlanDayOptions.map((days) => (
                <Button
                  key={days}
                  variant="choice"
                  aria-pressed={planDays === days}
                  disabled={isApplying}
                  className="flex-1"
                  onClick={() => setPlanDays(days)}
                >
                  {days} days
                </Button>
              ))}
            </div>
          </fieldset>

          {removedDates.length > 0 ? (
            <div className="mb-2 rounded-sm bg-mist px-3 py-2 text-13 text-ink">
              <p className="font-medium">
                This will shorten your plan by {removedDates.length}{" "}
                {removedDates.length === 1 ? "slot" : "slots"}.
              </p>
              <p className="mt-0.5 text-12 leading-4.5 text-graphite">
                Meals fill empty slots where possible; any that cannot fit will
                be removed.
              </p>
            </div>
          ) : null}

          <div className="flex min-h-19 items-center justify-between gap-3 border-b border-border">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-14 font-semibold text-ink">Plan starts</p>
              <p className="text-13 text-graphite">
                {formatPlanStartDate(startDate)}
              </p>
            </div>
            <label className="flex shrink-0 flex-col gap-1">
              <span className="text-11 font-medium text-graphite">
                Change date
              </span>
              <input
                type="date"
                aria-label="Change plan start date"
                value={startDate}
                disabled={isApplying}
                className="h-11 w-36 rounded-sm border border-border bg-paper px-2.5 text-16 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
                onChange={(event) => {
                  if (event.target.value !== "") {
                    setStartDate(event.target.value);
                  }
                }}
              />
            </label>
          </div>

          <div className="flex min-h-19 items-center justify-between gap-3 border-b border-border">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-14 font-semibold text-ink">Servings</p>
              <p className="text-12 text-graphite">
                Used for recipes and your shopping list
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <PlanCounterButton
                label="Decrease servings"
                disabled={servings <= MINIMUM_PLAN_SERVINGS || isApplying}
                onClick={() => setServings((current) => current - 1)}
              >
                <Minus aria-hidden="true" className="size-4" />
              </PlanCounterButton>
              <output
                aria-live="polite"
                className="flex h-11 w-6 items-center justify-center text-16 font-semibold text-ink"
              >
                {servings}
              </output>
              <PlanCounterButton
                label="Increase servings"
                disabled={servings >= MAXIMUM_PLAN_SERVINGS || isApplying}
                onClick={() => setServings((current) => current + 1)}
              >
                <Plus aria-hidden="true" className="size-4" />
              </PlanCounterButton>
            </div>
          </div>

          <DietaryPreferencesStub />

          {hasChanges ? (
            <fieldset className="mt-3.5 flex flex-col gap-2">
              <legend className="mb-2 text-14 font-semibold text-ink">
                Apply these changes to
              </legend>
              <PlanScopeOption
                name="active-plan-adjustment-scope"
                checked={scope === "this-plan"}
                title="This plan only"
                description="Keep my usual settings unchanged"
                onChange={() => setScope("this-plan")}
              />
              <PlanScopeOption
                name="active-plan-adjustment-scope"
                checked={scope === "future"}
                title="This and future plans"
                description="Save days and servings as usual; not the start date"
                onChange={() => setScope("future")}
              />
            </fieldset>
          ) : null}
        </DrawerBody>

        <DrawerFooter>
          <Button
            className="w-full"
            disabled={isApplying}
            aria-busy={isApplying}
            onClick={() => void applyChanges()}
          >
            {isApplying
              ? "Applying changes…"
              : hasChanges
                ? "Apply changes"
                : "Done"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function formatPlanStartDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
