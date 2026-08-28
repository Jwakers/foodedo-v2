"use client";

import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarPlus, CircleCheck, RefreshCw, Shuffle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  acceptGuestPlan,
  addDaysToPlanDate,
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
  | { reason: "active_plan_exists" }
  | { reason: "catalogue_unsupported" }
  | { reason: "date_conflict"; dates: string[] }
  | { reason: "unexpected" };

export function PlanInterface() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );

  return (
    <PlanContent
      currentPlan={currentPlan ?? null}
      isCurrentPlanLoading={
        isAuthLoading || (isAuthenticated && currentPlan === undefined)
      }
    />
  );
}

function PlanContent({
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

        const hasClaimProgress =
          restored !== null &&
          (restored.claim !== undefined || restored.acceptedAt !== undefined);

        if (hasClaimProgress) {
          if (!cancelled) {
            setDraft(restored);
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
              {draft.mealChoices.map((choice) => {
                const meal = mealById.get(choice.catalogueMealId);
                if (meal === undefined) return null;

                return (
                  <li
                    key={choice.date}
                    className="grid min-h-20 grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[7rem_1fr_auto]"
                  >
                    <p className="text-sm font-semibold text-muted-foreground">
                      {planDayLabel(choice.date)}
                    </p>
                    <div>
                      <h3 className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
                        <Link
                          href={`/recipes/${meal.slug}`}
                          className="rounded-sm underline decoration-transparent underline-offset-4 transition-colors hover:text-accent hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {meal.title}
                        </Link>
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
                  className={`${secondaryButtonClassName} gap-2`}
                  disabled={arePlanEditsDisabled}
                  onClick={() => void shufflePlan(Date.now())}
                >
                  <Shuffle aria-hidden="true" className="size-4" />
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
  const swapMeal = useMutation(api.mealPlans.swapMeal);
  const applyRegenerationProposal = useMutation(
    api.mealPlans.applyRegenerationProposal,
  );
  const undoPlanReplacement = useMutation(api.mealPlans.undoPlanReplacement);
  const startNew = useMutation(api.mealPlans.startNew);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isStartConfirmed, setIsStartConfirmed] = useState(false);
  const [proposalVariant, setProposalVariant] = useState<number | null>(null);
  const [proposalFromDate] = useState(todayPlanDate);
  const [undoReplacement, setUndoReplacement] = useState<{
    currentMealPlanId: CurrentMealPlan["_id"];
    previousMealPlanId: CurrentMealPlan["_id"];
    currentUpdatedAt: number;
  } | null>(null);
  const proposal = useQuery(
    api.mealPlans.getRegenerationProposal,
    proposalVariant === null
      ? "skip"
      : { fromDate: proposalFromDate, variant: proposalVariant },
  );
  const isBusy = isWriting || pendingAction !== null;
  const isReviewingProposal = proposalVariant !== null;

  async function swapSavedMeal(
    mealSlotId: CurrentMealPlan["mealSlots"][number]["_id"],
  ) {
    setPendingAction(`swap:${mealSlotId}`);
    setActionMessage(null);
    setUndoReplacement(null);
    try {
      const result = await swapMeal({ mealSlotId });
      setActionMessage(
        result.status === "swapped"
          ? "Meal swapped."
          : result.status === "not_found"
            ? "That meal is no longer in the current plan."
            : "This plan contains a meal that cannot be changed yet.",
      );
    } catch {
      setActionMessage("The meal could not be swapped. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function applyProposedPlan() {
    if (proposal?.status !== "ready") return;
    setPendingAction("apply-proposal");
    setActionMessage(null);
    try {
      const result = await applyRegenerationProposal({
        sourcePlanId: proposal.sourcePlanId,
        sourceUpdatedAt: proposal.sourceUpdatedAt,
        fromDate: proposal.fromDate,
        variant: proposal.variant,
      });
      if (result.status === "applied") {
        setUndoReplacement({
          currentMealPlanId: result.mealPlanId,
          previousMealPlanId: result.previousMealPlanId,
          currentUpdatedAt: result.currentUpdatedAt,
        });
        setProposalVariant(null);
        setActionMessage(
          "Plan updated. Any elapsed meals were kept and the previous version was archived.",
        );
        return;
      }
      setActionMessage(applyProposalFailureMessage(result.status));
    } catch {
      setActionMessage(
        "The proposed plan could not be applied. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function undoReplacementPlan() {
    if (undoReplacement === null) return;
    setPendingAction("undo-replacement");
    setActionMessage(null);
    try {
      const result = await undoPlanReplacement(undoReplacement);
      setActionMessage(
        result.status === "restored"
          ? "Your previous plan has been restored."
          : result.status === "plan_changed"
            ? "The current plan changed, so it was not replaced."
            : "The previous plan is no longer available.",
      );
      setUndoReplacement(null);
    } catch {
      setActionMessage(
        "The previous plan could not be restored. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function startAnotherPlan() {
    setPendingAction("start");
    setActionMessage(null);
    setUndoReplacement(null);
    try {
      await startNew({ startDate: todayPlanDate() });
      setActionMessage(
        "Your new plan is ready. The previous plan was archived.",
      );
      setIsStartConfirmed(false);
    } catch {
      setActionMessage("A new plan could not be started. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <article className="px-6 py-8 sm:px-0">
      <div className="mb-7 flex items-center gap-3 text-accent">
        {isReviewingProposal ? (
          <RefreshCw aria-hidden="true" className="size-8" />
        ) : (
          <CircleCheck aria-hidden="true" className="size-8" />
        )}
        <div>
          <p className="text-sm font-bold">
            {isReviewingProposal
              ? "Review an alternative"
              : "Saved to your account"}
          </p>
          {isReviewingProposal ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Your current plan remains unchanged until you choose this one.
            </p>
          ) : null}
        </div>
      </div>

      {isReviewingProposal ? (
        proposal === undefined ? (
          <PlanLoading message="Preparing another option…" />
        ) : proposal.status === "ready" ? (
          <ProposalPlanRows mealSlots={proposal.mealSlots} />
        ) : (
          <p className="border-y border-border py-8 text-sm text-danger">
            {proposalFailureMessage(proposal.status)}
          </p>
        )
      ) : (
        <CurrentPlanRows
          mealPlan={mealPlan}
          isBusy={isBusy}
          pendingAction={pendingAction}
          onSwap={swapSavedMeal}
        />
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {isReviewingProposal ? (
          <>
            <button
              type="button"
              className={primaryButtonClassName}
              disabled={isBusy || proposal?.status !== "ready"}
              onClick={() => void applyProposedPlan()}
            >
              {pendingAction === "apply-proposal"
                ? "Updating plan…"
                : "Use this plan"}
            </button>
            <button
              type="button"
              className={`${secondaryButtonClassName} gap-2`}
              disabled={isBusy || proposal === undefined}
              onClick={() =>
                setProposalVariant((current) =>
                  current === null || current === 100 ? 1 : current + 1,
                )
              }
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Show another
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              disabled={isBusy}
              onClick={() => setProposalVariant(null)}
            >
              Keep current plan
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${primaryButtonClassName} gap-2`}
              disabled={isBusy}
              onClick={() => {
                setActionMessage(null);
                setUndoReplacement(null);
                setIsStartConfirmed(false);
                setProposalVariant(1);
              }}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Suggest another plan
            </button>
            <button
              type="button"
              className={`${secondaryButtonClassName} gap-2`}
              disabled={isBusy}
              onClick={() => setIsStartConfirmed(true)}
            >
              <CalendarPlus aria-hidden="true" className="size-4" />
              Start another plan
            </button>
          </>
        )}
      </div>

      {isStartConfirmed ? (
        <div className="mt-5 border-l-2 border-accent pl-4">
          <p className="max-w-xl text-sm leading-6 text-foreground">
            This starts a fresh seven-day plan and archives the current one.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-bold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait"
              disabled={isBusy}
              onClick={() => void startAnotherPlan()}
            >
              {pendingAction === "start" ? "Starting…" : "Start fresh plan"}
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              disabled={isBusy}
              onClick={() => setIsStartConfirmed(false)}
            >
              Keep current plan
            </button>
          </div>
        </div>
      ) : null}

      <p
        className="mt-3 min-h-5 text-sm text-muted-foreground"
        aria-live="polite"
      >
        {actionMessage}
      </p>

      {undoReplacement !== null ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm font-bold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait"
          disabled={isBusy}
          onClick={() => void undoReplacementPlan()}
        >
          {pendingAction === "undo-replacement"
            ? "Restoring…"
            : "Undo plan change"}
        </button>
      ) : null}

      {hasDifferentLocalDraft ? (
        <div className="mt-7 border-l-2 border-accent pl-4">
          <p className="max-w-xl text-sm leading-6 text-foreground">
            This device also has a different temporary plan. It has not been
            overwritten or uploaded.
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            disabled={isBusy}
            onClick={() => void onDiscardLocalDraft()}
          >
            Discard temporary plan
          </button>
        </div>
      ) : null}
    </article>
  );
}

function CurrentPlanRows({
  mealPlan,
  isBusy,
  pendingAction,
  onSwap,
}: {
  mealPlan: CurrentMealPlan;
  isBusy: boolean;
  pendingAction: string | null;
  onSwap: (
    mealSlotId: CurrentMealPlan["mealSlots"][number]["_id"],
  ) => Promise<void>;
}) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {mealPlan.mealSlots.map((mealSlot) => (
        <li
          key={mealSlot._id}
          className="grid min-h-20 grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[7rem_1fr_auto]"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            {planDayLabel(mealSlot.date)}
          </p>
          <div>
            <h3 className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
              {mealSlot.catalogueMealSlug !== null ? (
                <RecipePlanLink
                  slug={mealSlot.catalogueMealSlug}
                  title={mealSlot.title}
                />
              ) : (
                mealSlot.title
              )}
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
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent underline decoration-border-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:text-muted-foreground"
            disabled={isBusy || !mealSlot.isAvailable}
            onClick={() => void onSwap(mealSlot._id)}
          >
            {pendingAction === `swap:${mealSlot._id}` ? "Swapping…" : "Swap"}
          </button>
        </li>
      ))}
    </ol>
  );
}

type ProposalMealSlot = Extract<
  FunctionReturnType<typeof api.mealPlans.getRegenerationProposal>,
  { status: "ready" }
>["mealSlots"][number];

function ProposalPlanRows({ mealSlots }: { mealSlots: ProposalMealSlot[] }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {mealSlots.map((mealSlot) => (
        <li
          key={mealSlot.date}
          className="grid min-h-20 grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[7rem_1fr_auto]"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            {planDayLabel(mealSlot.date)}
          </p>
          <div>
            <h3 className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
              <RecipePlanLink
                slug={mealSlot.catalogueMealSlug}
                title={mealSlot.title}
              />
            </h3>
            <MealMetadata
              prepMinutes={mealSlot.prepMinutes ?? undefined}
              cookMinutes={mealSlot.cookMinutes ?? undefined}
            />
          </div>
          <p
            className={`text-xs font-bold uppercase ${mealSlot.isChanged ? "text-accent" : "text-muted-foreground"}`}
          >
            {mealSlot.isChanged ? "New" : "Kept"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function RecipePlanLink({ slug, title }: { slug: string; title: string }) {
  return (
    <Link
      href={`/recipes/${slug}`}
      className="rounded-sm underline decoration-transparent underline-offset-4 transition-colors hover:text-accent hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {title}
    </Link>
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
        if (result.status === "active_plan_exists") {
          setClaimFailure({ reason: "active_plan_exists" });
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

function PlanLoading({
  message = "Building your plan…",
}: {
  message?: string;
}) {
  return (
    <div className="min-h-80 px-6 py-10 sm:px-0" aria-live="polite">
      <p className="text-sm font-semibold text-muted-foreground">{message}</p>
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

function planDayLabel(date: string) {
  const today = todayPlanDate();
  if (date === today) return "Today";
  if (date === addDaysToPlanDate(today, 1)) return "Tomorrow";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function claimFailureMessage(failure: ClaimFailure) {
  if (failure.reason === "active_plan_exists") {
    return "Your account already has a current plan. This temporary plan remains on this device.";
  }
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

function proposalFailureMessage(
  status: "no_active_plan" | "plan_unavailable" | "no_future_meals",
) {
  if (status === "no_active_plan") {
    return "There is no current plan to build an alternative from.";
  }
  if (status === "no_future_meals") {
    return "This plan has finished. Start another plan instead.";
  }
  return "This plan contains a meal that cannot be included in an alternative yet.";
}

function applyProposalFailureMessage(
  status:
    "plan_changed" | "no_active_plan" | "plan_unavailable" | "no_future_meals",
) {
  if (status === "plan_changed") {
    return "Your current plan changed while this alternative was open. Review a fresh suggestion before applying it.";
  }
  return proposalFailureMessage(status);
}

function formatPlanDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
