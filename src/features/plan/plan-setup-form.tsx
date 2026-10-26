"use client";

import { ArrowRight, Minus, Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PlanCounterButton, PlanScopeOption } from "./plan-adjustment-controls";
import type { PrePlanSetup } from "./pre-plan-setup-store";
import {
  isPlanDayOption,
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
  PLAN_DAY_OPTIONS,
} from "@/lib/domain/guest-draft";
import { todayPlanDate, tomorrowPlanDate } from "@/lib/domain/plan-display";

export function PlanSetupLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main
      aria-labelledby="plan-setup-heading"
      className="mx-auto w-full max-w-175 px-page-inline pt-6 pb-40"
    >
      <h1
        id="plan-setup-heading"
        className="font-display text-30 font-semibold tracking-title text-ink"
      >
        {title}
      </h1>
      <p className="mt-2 text-15 leading-relaxed text-graphite">
        {description}
      </p>
      <div className="mt-6">{children}</div>
      <div className="fixed inset-x-0 bottom-(--app-nav-height) z-30 border-t border-border bg-paper">
        <div className="mx-auto flex w-full max-w-175 flex-col gap-2.5 px-page-inline py-3.5">
          {footer}
        </div>
      </div>
    </main>
  );
}

export function PlanSetupForm({
  initialSetup,
  title,
  description,
  canRemember,
  showSavedRecipes,
  isHousehold,
  onGenerate,
}: {
  initialSetup: PrePlanSetup;
  title: string;
  description: string;
  canRemember: boolean;
  showSavedRecipes: boolean;
  isHousehold: boolean;
  onGenerate: (setup: PrePlanSetup, remember: boolean) => Promise<void>;
}) {
  const [planDays, setPlanDays] = useState(initialSetup.planDays);
  const [startDate, setStartDate] = useState(initialSetup.startDate);
  const [showCustomDate, setShowCustomDate] = useState(
    initialSetup.startDate !== todayPlanDate() &&
      initialSetup.startDate !== tomorrowPlanDate(),
  );
  const [servings, setServings] = useState(initialSetup.servings);
  const [prioritiseSavedRecipes, setPrioritiseSavedRecipes] = useState(
    initialSetup.prioritiseSavedRecipes,
  );
  const [scope, setScope] = useState<"this-plan" | "future">("this-plan");
  const [isGenerating, setIsGenerating] = useState(false);
  const generatingRef = useRef(false);
  const visiblePlanDayOptions = isPlanDayOption(planDays)
    ? PLAN_DAY_OPTIONS
    : [...PLAN_DAY_OPTIONS, planDays].toSorted((a, b) => a - b);
  const hasChanges =
    planDays !== initialSetup.planDays ||
    startDate !== initialSetup.startDate ||
    servings !== initialSetup.servings ||
    prioritiseSavedRecipes !== initialSetup.prioritiseSavedRecipes;

  function reset() {
    setPlanDays(initialSetup.planDays);
    setStartDate(initialSetup.startDate);
    setShowCustomDate(
      initialSetup.startDate !== todayPlanDate() &&
        initialSetup.startDate !== tomorrowPlanDate(),
    );
    setServings(initialSetup.servings);
    setPrioritiseSavedRecipes(initialSetup.prioritiseSavedRecipes);
    setScope("this-plan");
  }

  async function generate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    try {
      await onGenerate(
        { planDays, startDate, servings, prioritiseSavedRecipes },
        canRemember && hasChanges && scope === "future",
      );
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }

  return (
    <PlanSetupLayout
      title={title}
      description={description}
      footer={
        <>
          <p className="text-center text-13 text-graphite">
            {planDays} days · {formatSetupStart(startDate)} · serves {servings}
          </p>
          <Button
            className="w-full"
            disabled={isGenerating}
            aria-busy={isGenerating}
            onClick={() => void generate()}
          >
            {isGenerating
              ? "Planning your week…"
              : isHousehold
                ? "Plan our week"
                : "Plan my week"}
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </Button>
        </>
      }
    >
      <p className="mb-3 text-13 text-graphite">
        Your date range is a guide. Cook the meals in any order.
      </p>
      <div className="mb-2 flex justify-end">
        <Button
          variant="inline"
          className="h-11 px-2 text-graphite"
          disabled={!hasChanges || isGenerating}
          onClick={reset}
        >
          Reset
        </Button>
      </div>
      <fieldset disabled={isGenerating} className="flex min-w-0 flex-col">
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
                className="flex-1"
                onClick={() => setPlanDays(days)}
              >
                {days} days
              </Button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5 pb-3.5">
          <legend className="text-14 font-semibold text-ink">Starts</legend>
          <div className="flex gap-2">
            <StartDateButton
              active={!showCustomDate && startDate === todayPlanDate()}
              onClick={() => {
                setStartDate(todayPlanDate());
                setShowCustomDate(false);
              }}
            >
              Today
            </StartDateButton>
            <StartDateButton
              active={!showCustomDate && startDate === tomorrowPlanDate()}
              onClick={() => {
                setStartDate(tomorrowPlanDate());
                setShowCustomDate(false);
              }}
            >
              Tomorrow
            </StartDateButton>
            <Button
              variant="choice"
              aria-pressed={showCustomDate}
              className="flex-[1.2]"
              onClick={() => setShowCustomDate(true)}
            >
              Choose date
            </Button>
          </div>
          {showCustomDate ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-12 font-medium text-graphite">
                Plan start date
              </span>
              <input
                type="date"
                value={startDate}
                aria-label="Choose plan start date"
                className="h-11 w-full rounded-sm border border-border bg-paper px-3 text-16 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
                onChange={(event) => {
                  if (event.target.value !== "") {
                    setStartDate(event.target.value);
                  }
                }}
              />
            </label>
          ) : null}
        </fieldset>

        <div className="flex min-h-19 items-center justify-between gap-3 border-y border-border">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-14 font-semibold text-ink">Servings</p>
            <p className="text-12 text-graphite">
              Used for recipes and your shopping list
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PlanCounterButton
              label="Decrease servings"
              disabled={servings <= MINIMUM_PLAN_SERVINGS}
              onClick={() => setServings((current) => current - 1)}
            >
              <Minus aria-hidden="true" className="size-4" />
            </PlanCounterButton>
            <output className="flex h-11 w-6 items-center justify-center text-16 font-semibold text-ink">
              {servings}
            </output>
            <PlanCounterButton
              label="Increase servings"
              disabled={servings >= MAXIMUM_PLAN_SERVINGS}
              onClick={() => setServings((current) => current + 1)}
            >
              <Plus aria-hidden="true" className="size-4" />
            </PlanCounterButton>
          </div>
        </div>

        {showSavedRecipes ? (
          <label className="flex min-h-21.5 cursor-pointer items-center justify-between gap-3 border-b border-border">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-14 font-semibold text-ink">
                {isHousehold
                  ? "Use household favourites"
                  : "Use my saved recipes"}
              </span>
              <span className="text-12 text-graphite">
                {isHousehold
                  ? "Prioritise meals saved by your household"
                  : "Prioritise recipes you already like where they fit"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={prioritiseSavedRecipes}
              className="size-5 accent-leaf"
              onChange={(event) =>
                setPrioritiseSavedRecipes(event.target.checked)
              }
            />
          </label>
        ) : null}

        {canRemember && hasChanges ? (
          <fieldset className="mt-3.5 flex flex-col gap-2">
            <legend className="mb-2 text-14 font-semibold text-ink">
              Apply these changes to
            </legend>
            <PlanScopeOption
              name="pre-plan-adjustment-scope"
              checked={scope === "this-plan"}
              title="This plan only"
              description="Keep my usual settings unchanged"
              onChange={() => setScope("this-plan")}
            />
            <PlanScopeOption
              name="pre-plan-adjustment-scope"
              checked={scope === "future"}
              title="This and future plans"
              description="Save days, servings and recipe preference; not the start date"
              onChange={() => setScope("future")}
            />
          </fieldset>
        ) : null}
      </fieldset>
    </PlanSetupLayout>
  );
}

function StartDateButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="choice"
      aria-pressed={active}
      className="flex-1"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function formatSetupStart(startDate: string) {
  if (startDate === todayPlanDate()) return "starts today";
  if (startDate === tomorrowPlanDate()) return "starts tomorrow";
  const label = new Date(`${startDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `starts ${label}`;
}
