"use client";

import { Show, useAuth } from "@clerk/react";
import { ArrowRight, Clock, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useGuestPlanReviewDockEffect } from "@/features/plan/guest-plan-review-chrome";
import { PlanMealRow } from "@/features/plan/plan-meal-row";
import { SavePlanDrawer } from "@/features/plan/save-plan-drawer";
import {
  addCalendarDays,
  formatPlanDateWithWeekday,
  type GuestPlanMealRow,
} from "@/lib/domain/plan-display";

export function PlanReviewReady({
  mode,
  summary,
  rows,
  isSaving,
  isShuffling,
  isAddingDay,
  onSavePlan,
  onPrepareGuestSaveSignIn,
  onTryAnotherWeek,
  onRemoveMeal,
  onReplaceMeal,
  onAddDay,
}: {
  mode: "standard" | "replan";
  summary: string;
  rows: GuestPlanMealRow[];
  isSaving: boolean;
  isShuffling: boolean;
  isAddingDay: boolean;
  onSavePlan: () => void | Promise<void>;
  onPrepareGuestSaveSignIn: () => Promise<void>;
  onTryAnotherWeek: () => void | Promise<void>;
  onRemoveMeal: (date: string) => Promise<unknown> | void;
  onReplaceMeal: (
    date: string,
    catalogueMealId: string,
  ) => Promise<unknown> | void;
  onAddDay: () => Promise<void>;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [saveDrawerOpen, setSaveDrawerOpen] = useState(false);
  const [isPreparingSignIn, setIsPreparingSignIn] = useState(false);
  // Closing the drawer for Clerk must not clear the pending claim key.
  const preserveClaimOnCloseRef = useRef(false);
  const canAddDay = mode === "standard" && rows.length < 7;
  const nextPlanDate =
    canAddDay && rows.length > 0
      ? addCalendarDays(rows[rows.length - 1]!.date, 1)
      : null;

  useGuestPlanReviewDockEffect(isLoaded && !isSignedIn);

  function handleSaveDrawerOpenChange(nextOpen: boolean) {
    if (!nextOpen && preserveClaimOnCloseRef.current) {
      preserveClaimOnCloseRef.current = false;
      setSaveDrawerOpen(false);
      return;
    }
    setSaveDrawerOpen(nextOpen);
  }

  async function handleSignInToSave() {
    if (isPreparingSignIn) return;
    setIsPreparingSignIn(true);
    try {
      await onPrepareGuestSaveSignIn();
      preserveClaimOnCloseRef.current = true;
      setSaveDrawerOpen(false);
    } catch (error) {
      console.error("Failed to prepare guest plan save.", error);
      toast.error(
        error instanceof Error && error.message.startsWith("Save at least")
          ? error.message
          : "Foodedo couldn’t save your place. Check storage access and try again.",
      );
    } finally {
      setIsPreparingSignIn(false);
    }
  }

  function handlePrimarySave() {
    if (!isLoaded) {
      toast.info("Foodedo is still checking your account. Try again.");
      return;
    }

    if (!isSignedIn) {
      setSaveDrawerOpen(true);
      return;
    }

    void onSavePlan();
  }

  return (
    <main
      aria-labelledby="plan-review-heading"
      className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-4.5 pb-8"
    >
      <div className="flex flex-col gap-1.5">
        <h1
          id="plan-review-heading"
          className="font-display text-30 font-semibold tracking-title text-ink"
        >
          {mode === "replan"
            ? "Review your replanned week"
            : "Your week is ready"}
        </h1>
        <p className="text-14 font-medium text-graphite">{summary}</p>
      </div>

      {mode === "replan" ? (
        <p className="mt-4 rounded-sm bg-mist px-3 py-2.5 text-13 leading-5 text-graphite">
          Your dates, servings and free days stay the same. Saving replaces the
          planned meals, and your current Shopping list will be marked out of
          date so you can rebuild it.
        </p>
      ) : null}

      <Show when="signed-out">
        <div className="mt-5 flex items-center gap-2.5 rounded-md border border-mist bg-mist p-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
            <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          </div>
          <p className="text-14 text-graphite">
            Keep planning. Sign in when you&apos;re ready to save this week.
          </p>
        </div>
      </Show>

      <ul className="mt-5">
        {rows.map((row) => (
          <li key={row.date}>
            <PlanMealRow
              row={row}
              onRemoveMeal={onRemoveMeal}
              onReplaceMeal={onReplaceMeal}
            />
          </li>
        ))}
      </ul>

      {nextPlanDate ? (
        <div className="flex flex-col items-center gap-1.5 border-b border-border py-4">
          <Button
            variant="secondary"
            disabled={isAddingDay || isSaving || isShuffling}
            aria-busy={isAddingDay}
            className="h-11 w-full rounded-full border-leaf text-13 font-semibold text-leaf hover:border-leaf hover:bg-leaf-soft disabled:border-border"
            onClick={() => {
              void (async () => {
                try {
                  await onAddDay();
                } catch (error) {
                  console.error(
                    "Failed to add a day to the plan draft.",
                    error,
                  );
                  toast.error(
                    "Foodedo couldn’t add another day. Check storage access and try again.",
                  );
                }
              })();
            }}
          >
            {isAddingDay ? (
              "Adding another day…"
            ) : (
              <>
                <Plus aria-hidden="true" className="size-4" />
                Add another day
              </>
            )}
          </Button>
          <p className="max-w-80 text-center text-11 leading-4 text-graphite">
            Adds {formatPlanDateWithWeekday(nextPlanDate)} with a meal chosen
            for you.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <Button
          className="w-full"
          disabled={isSaving || isAddingDay}
          aria-busy={isSaving}
          onClick={handlePrimarySave}
        >
          {isSaving
            ? "Saving…"
            : mode === "replan"
              ? "Replace this week"
              : "Save my plan"}
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>
        <Button
          variant="inline"
          size="block"
          disabled={isShuffling || isSaving || isAddingDay}
          aria-busy={isShuffling}
          onClick={() => {
            void (async () => {
              try {
                await onTryAnotherWeek();
              } catch (error) {
                console.error("Failed to shuffle guest plan draft.", error);
                toast.error(
                  "Foodedo couldn’t refresh this week. Check storage access and try again.",
                );
              }
            })();
          }}
        >
          {isShuffling ? "Finding another week…" : "Try another week"}
        </Button>
      </div>

      <Show when="signed-out">
        <SavePlanDrawer
          open={saveDrawerOpen}
          onOpenChange={handleSaveDrawerOpenChange}
          onSignInToSave={handleSignInToSave}
          isPreparing={isPreparingSignIn}
        />
      </Show>
    </main>
  );
}
