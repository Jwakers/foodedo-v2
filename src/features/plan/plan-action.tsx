"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  useAuth,
  useClerk,
} from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ArrowRight, CircleCheck, Minus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
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
  createAdjustPlanIntent,
  readAdjustPlanIntent,
} from "@/lib/domain/auth-intents";
import { beginConfiguredGuestPlanDraft } from "@/features/plan/guest-plan-draft";
import {
  DietaryPreferencesStub,
  PlanCounterButton,
  PlanScopeOption,
} from "@/features/plan/plan-adjustment-controls";
import type { PrePlanSetup } from "@/features/plan/pre-plan-setup-store";
import { usePrePlanSetup } from "@/features/plan/use-pre-plan-setup";
import {
  isPlanDayOption,
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
  PLAN_DAY_OPTIONS,
} from "@/lib/domain/guest-draft";
import { todayPlanDate, tomorrowPlanDate } from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { createAdjustPlanIntentStore } from "@/lib/platform/auth-intent-store";

const guestBenefits = [
  {
    title: "Usual plan length",
    description: "3, 5 or 7 days — remembered next time",
  },
  {
    title: "Servings",
    description: "Sized for your household and shopping list",
  },
  {
    title: "Dietary & planning preferences",
    description: "Prefer recipes you like — remembered next time",
  },
] as const;

export function PlanAction({
  onPlanCreated,
}: {
  onPlanCreated?: () => void | Promise<unknown>;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const { openSignIn } = useClerk();
  const preferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const savedCatalogueMeals = useQuery(
    api.recipes.listSavedCatalogueMeals,
    isAuthenticated ? { catalogueVersion: standardCatalogue.version } : "skip",
  );
  // Vaul treats nested Clerk modal clicks as outside-dismiss. Close the drawer
  // before opening Clerk, and keep the intent for post-auth Adjust resume.
  const preserveIntentOnCloseRef = useRef(false);
  const fallbackSetup: PrePlanSetup = preferences
    ? {
        planDays: preferences.usualPlanDays,
        startDate: tomorrowPlanDate(),
        servings: preferences.usualServings,
        prioritiseSavedRecipes: preferences.prioritiseSavedRecipes,
      }
    : {
        planDays: 7,
        startDate: tomorrowPlanDate(),
        servings: 4,
        prioritiseSavedRecipes: true,
      };
  const { setup, applySetup } = usePrePlanSetup(fallbackSetup);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    void (async () => {
      const store = createAdjustPlanIntentStore();
      const intent = readAdjustPlanIntent(await store.read());
      if (!intent || cancelled) return;

      // Resume Adjust even if clearing the one-shot intent fails.
      setOpen(true);
      try {
        await store.clear();
      } catch (error) {
        console.error("Failed to clear adjust-plan resume intent.", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function handleDrawerOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen || isSignedIn) return;

    if (preserveIntentOnCloseRef.current) {
      preserveIntentOnCloseRef.current = false;
      return;
    }

    void createAdjustPlanIntentStore().clear();
  }

  async function beginPersonaliseSignIn() {
    try {
      await createAdjustPlanIntentStore().write(
        createAdjustPlanIntent({ now: Date.now() }),
      );
    } catch (error) {
      console.error("Failed to store adjust-plan resume intent.", error);
      toast.error(
        "Foodedo couldn’t save your place. Check storage access and try again.",
      );
      return;
    }

    // openSignIn returns void with no dismissal callback; keep the intent so
    // Adjust can resume after auth, and skip clearing when this close is for Clerk.
    preserveIntentOnCloseRef.current = true;
    setOpen(false);
    openSignIn({});
  }

  async function planWeek() {
    if (isPlanning) return;
    setIsPlanning(true);
    try {
      await beginConfiguredGuestPlanDraft({
        planStartDate: setup.startDate,
        planDays: setup.planDays,
        servings: setup.servings,
        preferredCatalogueMealIds: setup.prioritiseSavedRecipes
          ? (savedCatalogueMeals ?? []).map((meal) => meal.catalogueMealId)
          : [],
      });
      if (onPlanCreated) {
        await onPlanCreated();
      } else {
        router.push("/week");
      }
    } catch (error) {
      console.error("Failed to start the configured plan.", error);
      toast.error(
        "Foodedo couldn’t start your week. Check storage access and try again.",
      );
      setIsPlanning(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button
        className="w-full"
        disabled={
          isPlanning ||
          (isAuthenticated &&
            (preferences === undefined || savedCatalogueMeals === undefined))
        }
        aria-busy={isPlanning}
        onClick={() => void planWeek()}
      >
        {isPlanning ? "Planning your week…" : "Plan my week"}
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </Button>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-13 text-graphite">
          {setup.planDays} days · {formatSetupStart(setup.startDate)} · serves{" "}
          {setup.servings}
        </p>

        <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
          <DrawerTrigger asChild>
            <Button
              variant="inline"
              className="text-ink"
              disabled={isAuthenticated && preferences === undefined}
            >
              Adjust
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <ClerkLoading>
              <LoadingDrawerContent />
            </ClerkLoading>
            <ClerkFailed>
              <UnavailableDrawerContent />
            </ClerkFailed>
            <ClerkLoaded>
              <Show when="signed-out">
                <GuestDrawerContent onPersonalise={beginPersonaliseSignIn} />
              </Show>
              <Show when="signed-in">
                <SignedInDrawerContent
                  key={`${setup.planDays}:${setup.startDate}:${setup.servings}:${setup.prioritiseSavedRecipes ? 1 : 0}`}
                  initialSetup={setup}
                  onApply={(nextSetup) => {
                    applySetup(nextSetup);
                    setOpen(false);
                  }}
                />
              </Show>
            </ClerkLoaded>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

function GuestDrawerContent({
  onPersonalise,
}: {
  onPersonalise: () => void | Promise<void>;
}) {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Make Foodedo fit your week</DrawerTitle>
          <DrawerDescription>
            Sign in to choose your usual plan length, servings and preferences.
            Foodedo will remember them next time — or close this and keep
            planning with sensible defaults.
          </DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>

      <DrawerBody className="flex flex-col gap-2 pt-1">
        {guestBenefits.map((benefit) => (
          <Benefit key={benefit.title} {...benefit} />
        ))}
      </DrawerBody>

      <DrawerFooter>
        <Button className="w-full" onClick={() => void onPersonalise()}>
          Sign in to personalise
        </Button>
      </DrawerFooter>
    </>
  );
}

function SignedInDrawerContent({
  initialSetup,
  onApply,
}: {
  initialSetup: PrePlanSetup;
  onApply: (setup: PrePlanSetup) => void;
}) {
  const updateUsual = useMutation(api.planningPreferences.updateUsual);
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
  const [isApplying, setIsApplying] = useState(false);
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

  async function apply() {
    const nextSetup = {
      planDays,
      startDate,
      servings,
      prioritiseSavedRecipes,
    };
    if (!hasChanges) {
      onApply(nextSetup);
      return;
    }
    setIsApplying(true);
    try {
      if (scope === "future") {
        await updateUsual({
          usualPlanDays: planDays,
          usualServings: servings,
          prioritiseSavedRecipes,
        });
      }
      onApply(nextSetup);
    } catch (error) {
      console.error("Failed to apply planning preferences.", error);
      toast.error("Foodedo couldn’t save those preferences. Try again.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>
            Change what matters. Foodedo handles the rest.
          </DrawerDescription>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="inline"
            size="headerIcon"
            className="w-auto px-2 text-graphite"
            disabled={!hasChanges || isApplying}
            onClick={reset}
          >
            Reset
          </Button>
          <DrawerDismissButton />
        </div>
      </DrawerHeader>

      <DrawerBody className="flex flex-col pb-4 pt-2">
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
                className="h-11 w-full rounded-sm border border-border bg-paper px-3 text-14 font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
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

        <label className="flex min-h-21.5 cursor-pointer items-center justify-between gap-3 border-b border-border">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-14 font-semibold text-ink">
              Use my saved recipes
            </span>
            <span className="text-12 text-graphite">
              Prioritise recipes you already like where they fit
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

        <DietaryPreferencesStub />

        {hasChanges ? (
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
      </DrawerBody>

      <DrawerFooter>
        <Button
          className="w-full"
          disabled={isApplying}
          aria-busy={isApplying}
          onClick={() => void apply()}
        >
          {isApplying
            ? "Applying changes…"
            : hasChanges
              ? "Apply changes"
              : "Done"}
        </Button>
      </DrawerFooter>
    </>
  );
}

function LoadingDrawerContent() {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>Checking your account status…</DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>
      <DrawerBody>
        <div className="h-24 animate-pulse rounded-sm bg-mist" />
      </DrawerBody>
    </>
  );
}

function UnavailableDrawerContent() {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>
            Account status is temporarily unavailable.
          </DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>
      <DrawerBody>
        <p className="text-15 leading-relaxed text-graphite">
          Close this drawer and try again shortly.
        </p>
      </DrawerBody>
    </>
  );
}

function DrawerDismissButton() {
  return (
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
  );
}

function Benefit({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-sm bg-mist px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
        <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-14 font-semibold leading-4.5 text-ink">{title}</p>
        <p className="text-12 leading-4 text-graphite">{description}</p>
      </div>
    </div>
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
