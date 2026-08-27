"use client";

import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  acceptGuestPlan,
  completeGuestPlanClaim,
  createGuestDraft,
  guestDraftMatchesSavedPlan,
  readGuestDraftV1,
  requestGuestPlanClaim,
  shuffleGuestPlan,
  swapGuestPlanMeal,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { createIndexedDbGuestDraftStore } from "@/lib/platform/guest-draft-store";

const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);
const mealById = new Map(
  standardCatalogue.meals.map((meal) => [meal.id, meal]),
);
const primaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-55";
const secondaryButtonClassName =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-border-strong px-6 py-3 text-sm font-bold text-foreground transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-wait disabled:text-muted-foreground";

type InteractionState = "ready" | "writing";
type CurrentMealPlan = NonNullable<
  FunctionReturnType<typeof api.mealPlans.getCurrent>
>;

type ClaimFailure =
  | { reason: "catalogue_unsupported" }
  | { reason: "date_conflict"; dates: string[] }
  | { reason: "unexpected" };

export function GuestDecide() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );

  return (
    <GuestDecideContent
      currentPlan={currentPlan ?? null}
      isCurrentPlanLoading={
        isAuthLoading || (isAuthenticated && currentPlan === undefined)
      }
    />
  );
}

function GuestDecideContent({
  currentPlan,
  isCurrentPlanLoading,
}: {
  currentPlan: CurrentMealPlan | null;
  isCurrentPlanLoading: boolean;
}) {
  const store = useMemo(() => createIndexedDbGuestDraftStore(), []);
  const [draft, setDraft] = useState<GuestDraftV1 | null | undefined>(
    undefined,
  );
  const [interactionState, setInteractionState] =
    useState<InteractionState>("ready");
  const [storageWarning, setStorageWarning] = useState(false);
  const hasCurrentPlan = currentPlan !== null;

  useEffect(() => {
    if (isCurrentPlanLoading) return;

    let cancelled = false;

    async function hydrate() {
      setDraft(undefined);

      try {
        const stored = await store.read();
        const restored = readGuestDraftV1(stored, {
          catalogueVersion: standardCatalogue.version,
          catalogueMealIds,
        });
        const isCurrentDay =
          restored !== null && restored.planStartDate === todayPlanDate();

        if (isCurrentDay) {
          if (!cancelled) {
            setDraft(restored);
            setStorageWarning(false);
          }
          return;
        }

        if (hasCurrentPlan) {
          if (stored !== null) await store.clear();
          if (!cancelled) {
            setDraft(null);
            setStorageWarning(false);
          }
          return;
        }

        const freshDraft = newGuestDraft();
        await store.write(freshDraft);
        if (!cancelled) {
          setDraft(freshDraft);
          setStorageWarning(false);
        }
      } catch {
        if (!cancelled) {
          setDraft(hasCurrentPlan ? null : newGuestDraft());
          setStorageWarning(true);
        }
      } finally {
        if (!cancelled) setInteractionState("ready");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [hasCurrentPlan, isCurrentPlanLoading, store]);

  const localDraftMatchesServer =
    draft !== undefined && draft !== null && currentPlan !== null
      ? guestDraftMatchesSavedPlan(draft, currentPlan.mealSlots)
      : false;

  useEffect(() => {
    if (!hasCurrentPlan || !localDraftMatchesServer) {
      return;
    }

    let cancelled = false;
    void store
      .clear()
      .then(() => {
        if (cancelled) return;
        setDraft(null);
        setStorageWarning(false);
      })
      .catch(() => {
        if (!cancelled) setStorageWarning(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hasCurrentPlan, localDraftMatchesServer, store]);

  async function persist(nextDraft: GuestDraftV1) {
    setDraft(nextDraft);
    setInteractionState("writing");

    try {
      await store.write(nextDraft);
      setStorageWarning(false);
      return true;
    } catch {
      setStorageWarning(true);
      return false;
    } finally {
      setInteractionState("ready");
    }
  }

  async function swapMeal(date: string, now: number) {
    if (draft === undefined || draft === null) return;
    await persist(swapGuestPlanMeal(draft, date, catalogueMealIds, now));
  }

  async function shufflePlan(now: number) {
    if (draft === undefined || draft === null) return;
    await persist(shuffleGuestPlan(draft, catalogueMealIds, now));
  }

  async function clearDraft() {
    const freshDraft = newGuestDraft();
    setInteractionState("writing");
    try {
      await store.clear();
      await store.write(freshDraft);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    } finally {
      setDraft(freshDraft);
      setInteractionState("ready");
    }
  }

  async function acknowledgeClaim(claimedDraft: GuestDraftV1) {
    setDraft(completeGuestPlanClaim(claimedDraft, Date.now()));
    setInteractionState("writing");
    try {
      await store.clear();
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    } finally {
      setInteractionState("ready");
    }
  }

  async function discardDifferentLocalDraft() {
    setInteractionState("writing");
    try {
      await store.clear();
      setDraft(null);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    } finally {
      setInteractionState("ready");
    }
  }

  const isWriting = interactionState === "writing";
  const isClaimInFlight =
    draft?.claim !== undefined && draft.claim.completedAt === undefined;
  const arePlanEditsDisabled = isWriting || isClaimInFlight;
  const isSaved = draft?.claim?.completedAt !== undefined;
  const hasDifferentLocalDraft =
    draft !== undefined &&
    draft !== null &&
    currentPlan !== null &&
    !localDraftMatchesServer;
  const isPlanLoading =
    isCurrentPlanLoading ||
    draft === undefined ||
    (currentPlan === null && draft === null);

  return (
    <section aria-labelledby="decide-heading">
      <div className="max-w-2xl">
        <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
          Decide · Next 7 days
        </p>
        <h2
          id="decide-heading"
          className="mt-3 font-display text-5xl leading-[0.96] tracking-[-0.04em] text-foreground sm:text-6xl"
        >
          Your week, decided.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          A practical seven-day meal plan you can adjust before keeping. No
          account is needed to try it.
        </p>
      </div>

      <div
        className="mt-9 overflow-hidden border-y border-border bg-surface sm:border sm:px-8"
        aria-busy={isPlanLoading || isWriting}
        aria-live="polite"
      >
        {isPlanLoading ? (
          <PlanLoading />
        ) : currentPlan !== null ? (
          <SavedAccountPlan
            mealPlan={currentPlan}
            hasDifferentLocalDraft={hasDifferentLocalDraft}
            isWriting={isWriting}
            onDiscardLocalDraft={discardDifferentLocalDraft}
          />
        ) : draft !== undefined && draft !== null ? (
          <article className="px-6 py-8 sm:px-0">
            {isSaved ? (
              <div className="mb-7 flex items-center gap-3 text-accent">
                <CircleCheck aria-hidden="true" className="size-8" />
                <p className="text-sm font-bold">Saved to your account</p>
              </div>
            ) : null}

            <ol className="divide-y divide-border border-y border-border">
              {draft.mealChoices.map((choice, index) => {
                const meal = mealById.get(choice.catalogueMealId);
                if (meal === undefined) return null;

                return (
                  <li
                    key={choice.date}
                    className="grid min-h-20 grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[7rem_1fr_auto]"
                  >
                    <p className="text-sm font-semibold text-muted-foreground">
                      {planDayLabel(choice.date, index)}
                    </p>
                    <div>
                      <h3 className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
                        {meal.title}
                      </h3>
                      <MealMetadata
                        prepMinutes={meal.prepMinutes}
                        cookMinutes={meal.cookMinutes}
                      />
                    </div>
                    {!isSaved ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent underline decoration-border-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:text-muted-foreground"
                        disabled={arePlanEditsDisabled}
                        onClick={() => void swapMeal(choice.date, Date.now())}
                      >
                        Swap
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start">
              {isSaved ? (
                <p className="min-h-12 py-3 text-sm font-semibold text-accent">
                  Finishing account sync…
                </p>
              ) : (
                <KeepPlanAction
                  draft={draft}
                  disabled={isWriting}
                  onDraftChange={persist}
                  onClaimAcknowledged={acknowledgeClaim}
                />
              )}

              {!isSaved ? (
                <button
                  type="button"
                  className={secondaryButtonClassName}
                  disabled={arePlanEditsDisabled}
                  onClick={() => void shufflePlan(Date.now())}
                >
                  Shuffle plan
                </button>
              ) : null}
              {!isSaved ? (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  disabled={arePlanEditsDisabled}
                  onClick={() => void clearDraft()}
                >
                  Clear temporary plan
                </button>
              ) : null}
            </div>
          </article>
        ) : (
          <PlanLoading />
        )}
      </div>

      <p
        className={`mt-3 min-h-5 text-sm ${storageWarning ? "text-danger" : "text-muted-foreground"}`}
        aria-live="polite"
      >
        {storageWarning
          ? "This plan could not be stored. Sign-in will not open until it is safe to continue."
          : currentPlan !== null
            ? hasDifferentLocalDraft
              ? "Your saved account plan is shown. A different temporary plan remains safely on this device."
              : "This account plan is now the durable version on every device."
            : isSaved
              ? "This account copy is now the durable version of the plan."
              : "Your guest plan stays on this device until you sign in to keep it."}
      </p>
    </section>
  );
}

function SavedAccountPlan({
  mealPlan,
  hasDifferentLocalDraft,
  isWriting,
  onDiscardLocalDraft,
}: {
  mealPlan: CurrentMealPlan;
  hasDifferentLocalDraft: boolean;
  isWriting: boolean;
  onDiscardLocalDraft: () => Promise<void>;
}) {
  return (
    <article className="px-6 py-8 sm:px-0">
      <div className="mb-7 flex items-center gap-3 text-accent">
        <CircleCheck aria-hidden="true" className="size-8" />
        <p className="text-sm font-bold">Saved to your account</p>
      </div>

      <ol className="divide-y divide-border border-y border-border">
        {mealPlan.mealSlots.map((mealSlot, index) => (
          <li
            key={mealSlot._id}
            className="grid min-h-20 grid-cols-[5.5rem_1fr] items-center gap-3 py-3 sm:grid-cols-[7rem_1fr]"
          >
            <p className="text-sm font-semibold text-muted-foreground">
              {planDayLabel(mealSlot.date, index)}
            </p>
            <div>
              <h3 className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
                {mealSlot.title}
              </h3>
              {mealSlot.isAvailable ? (
                <MealMetadata
                  prepMinutes={mealSlot.prepMinutes ?? undefined}
                  cookMinutes={mealSlot.cookMinutes ?? undefined}
                />
              ) : (
                <p className="mt-1 text-xs font-semibold text-danger">
                  This saved meal needs attention.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {hasDifferentLocalDraft ? (
        <div className="mt-7 border-l-2 border-accent pl-4">
          <p className="max-w-xl text-sm leading-6 text-foreground">
            This device also has a different temporary plan. It has not been
            overwritten or uploaded.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            disabled={isWriting}
            onClick={() => void onDiscardLocalDraft()}
          >
            Discard temporary plan
          </button>
        </div>
      ) : null}
    </article>
  );
}

function KeepPlanAction({
  draft,
  disabled,
  onDraftChange,
  onClaimAcknowledged,
}: {
  draft: GuestDraftV1;
  disabled: boolean;
  onDraftChange: (draft: GuestDraftV1) => Promise<boolean>;
  onClaimAcknowledged: (draft: GuestDraftV1) => Promise<void>;
}) {
  const clerk = useClerk();
  const { userId } = useClerkAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const inFlightClaimKey = useRef<string | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const onClaimAcknowledgedRef = useRef(onClaimAcknowledged);
  const [claimFailure, setClaimFailure] = useState<ClaimFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onClaimAcknowledgedRef.current = onClaimAcknowledged;
  }, [onClaimAcknowledged, onDraftChange]);

  useEffect(() => {
    const claim = draft.claim;
    if (
      !isAuthenticated ||
      claim === undefined ||
      claim.completedAt !== undefined ||
      inFlightClaimKey.current === claim.key
    ) {
      return;
    }

    let cancelled = false;
    inFlightClaimKey.current = claim.key;
    setClaimFailure(null);

    void claimGuestDraft({
      claimKey: claim.key,
      schemaVersion: draft.schemaVersion,
      catalogueVersion: draft.catalogueVersion,
      planStartDate: draft.planStartDate,
      mealChoices: draft.mealChoices,
    })
      .then(async (result) => {
        if (cancelled) return;
        if (result.status === "date_conflict") {
          setClaimFailure({
            reason: "date_conflict",
            dates: result.dates,
          });
          return;
        }
        if (result.status === "catalogue_unsupported") {
          setClaimFailure({ reason: "catalogue_unsupported" });
          return;
        }
        await onClaimAcknowledgedRef.current(draft);
      })
      .catch(() => {
        if (!cancelled) setClaimFailure({ reason: "unexpected" });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, claimGuestDraft, draft, isAuthenticated]);

  async function keepPlan() {
    setClaimFailure(null);
    let nextDraft = draft;

    if (nextDraft.acceptedAt === undefined) {
      nextDraft = acceptGuestPlan(nextDraft, Date.now());
    }
    if (nextDraft.claim === undefined) {
      nextDraft = requestGuestPlanClaim(
        nextDraft,
        crypto.randomUUID(),
        Date.now(),
      );
    }

    const stored = await onDraftChange(nextDraft);
    if (!stored) return;

    if (userId === null) {
      clerk.openSignIn();
      return;
    }

    inFlightClaimKey.current = null;
    setAttempt((current) => current + 1);
  }

  const isClaiming =
    isAuthenticated &&
    draft.claim !== undefined &&
    draft.claim.completedAt === undefined &&
    claimFailure === null;
  const canRetry = claimFailure?.reason === "unexpected";

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className={primaryButtonClassName}
        disabled={
          disabled ||
          isLoading ||
          isClaiming ||
          (claimFailure !== null && !canRetry)
        }
        onClick={() => void keepPlan()}
      >
        {isClaiming
          ? "Saving plan…"
          : canRetry
            ? "Try saving again"
            : claimFailure !== null
              ? "Plan not saved"
              : draft.claim !== undefined && userId === null
                ? "Continue sign in"
                : "Keep this plan"}
      </button>
      <p
        className={`min-h-5 text-sm ${claimFailure !== null ? "text-danger" : "text-muted-foreground"}`}
        aria-live="polite"
      >
        {claimFailure !== null
          ? claimFailureMessage(claimFailure)
          : userId === null
            ? "Sign in only when you want this plan on every device."
            : "This will save the plan to your account."}
      </p>
    </div>
  );
}

function PlanLoading() {
  return (
    <div className="min-h-80 px-6 py-10 sm:px-0" aria-live="polite">
      <p className="text-sm font-semibold text-muted-foreground">
        Building your plan…
      </p>
    </div>
  );
}

function MealMetadata({
  prepMinutes,
  cookMinutes,
}: {
  prepMinutes?: number;
  cookMinutes?: number;
}) {
  const totalMinutes = (prepMinutes ?? 0) + (cookMinutes ?? 0);
  if (totalMinutes === 0) return null;
  return (
    <p className="mt-1 text-xs font-semibold text-accent">
      {totalMinutes} minutes
    </p>
  );
}

function newGuestDraft() {
  const now = Date.now();
  return createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate: todayPlanDate(),
    catalogueMealIds: rotateCatalogueForDate(now),
    now,
  });
}

function rotateCatalogueForDate(now: number) {
  const index = Math.floor(now / 86_400_000) % catalogueMealIds.length;
  return catalogueMealIds.map(
    (_, offset) =>
      catalogueMealIds[(index + offset) % catalogueMealIds.length]!,
  );
}

function todayPlanDate() {
  const date = new Date();
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function planDayLabel(date: string, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function claimFailureMessage(failure: ClaimFailure) {
  if (failure.reason === "catalogue_unsupported") {
    return "This draft uses a meal catalogue version that is no longer supported. Your local copy is unchanged.";
  }
  if (failure.reason === "date_conflict") {
    const dates = new Intl.ListFormat("en-GB", {
      style: "long",
      type: "conjunction",
    }).format(failure.dates.map(formatPlanDate));
    return `Meals are already saved for ${dates}. Nothing was overwritten.`;
  }
  return "The plan was not saved. Your draft is safe; please try again.";
}

function formatPlanDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
