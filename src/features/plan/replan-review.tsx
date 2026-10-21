"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { useHouseholdSpace } from "@/features/household/household-context";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { AccountConnectionError } from "@/components/account-connection-error";
import { getDraftSpaceKey } from "@/lib/platform/draft-space";
import {
  todayPlanDate,
  formatPlanWeekdayLong,
} from "@/lib/domain/plan-display";
import { PlanReviewLoading } from "./plan-review-loading";

export function ReplanReview() {
  const { status, isAuthenticated } = useFoodedoAuth();
  const { spaceArgs, ready, isHousehold, spaceKey } = useHouseholdSpace();
  const params = useSearchParams();
  const sourceId = params.get("plan");
  const revision = Number(params.get("revision"));
  const origin = params.get("space");
  const [fromDate] = useState(todayPlanDate);
  const [variant] = useState(1);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const proposal = useQuery(
    api.mealPlans.getRegenerationProposal,
    isAuthenticated && ready && origin === spaceKey
      ? { ...spaceArgs, fromDate, variant }
      : "skip",
  );
  const current = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated && ready ? spaceArgs : "skip",
  );
  const apply = useMutation(api.mealPlans.applyRegenerationProposal);
  const undo = useMutation(api.mealPlans.undoPlanReplacement);
  const router = useRouter();
  if (status === "connection_error") return <AccountConnectionError />;
  if (status === "guest")
    return (
      <main className="mx-auto flex w-full max-w-175 flex-col gap-4 px-page-inline py-7">
        <h1 className="font-display text-30 font-semibold">
          Open your week first
        </h1>
        <p className="text-15 text-graphite">
          Return to Week to sign in and review your saved plan.
        </p>
        <ButtonLink href="/week">Go to Week</ButtonLink>
      </main>
    );
  if (
    status === "loading" ||
    !ready ||
    (origin === spaceKey && (proposal === undefined || current === undefined))
  )
    return <PlanReviewLoading />;
  const stale =
    changed ||
    origin !== spaceKey ||
    (proposal?.status === "ready" &&
      (proposal.sourcePlanId !== sourceId ||
        proposal.sourceUpdatedAt !== revision));
  if (stale)
    return (
      <main className="mx-auto flex max-w-175 flex-col gap-4 px-page-inline py-7">
        <h1 className="font-display text-30 font-semibold">
          This week has changed
        </h1>
        <p className="text-15 leading-relaxed text-graphite">
          Review the latest week before making another replacement.
        </p>
        <ButtonLink href="/week">Review latest week</ButtonLink>
      </main>
    );
  if (proposal?.status !== "ready" || !current)
    return (
      <main className="mx-auto flex max-w-175 flex-col gap-4 px-page-inline py-7">
        <h1 className="font-display text-30 font-semibold">
          No remaining meals to replan
        </h1>
        <ButtonLink href="/week">Return to Week</ButtonLink>
      </main>
    );
  const reviewed = proposal;
  const past = reviewed.mealSlots.filter((slot) => slot.date < fromDate);
  const remaining = reviewed.mealSlots.filter((slot) => slot.date >= fromDate);
  async function applyReviewed() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apply({
        ...spaceArgs,
        sourcePlanId: reviewed.sourcePlanId,
        sourceUpdatedAt: reviewed.sourceUpdatedAt,
        fromDate: reviewed.fromDate,
        variant: reviewed.variant,
      });
      if (result.status !== "applied") {
        setChanged(true);
        return;
      }
      if (getDraftSpaceKey() === spaceKey) router.replace("/week");
      toast.success(
        isHousehold ? "Household week updated" : "Private week updated",
        {
          action: {
            label: "Undo",
            onClick: () => {
              void undo({
                ...spaceArgs,
                currentMealPlanId: result.mealPlanId,
                previousMealPlanId: result.previousMealPlanId,
                currentUpdatedAt: result.currentUpdatedAt,
              })
                .then((value) => {
                  if (value.status !== "restored")
                    toast.error(
                      "This week has changed. Review the latest week.",
                    );
                })
                .catch(() => toast.error("The week couldn’t be restored."));
            },
          },
        },
      );
    } catch {
      toast.error(
        "The week couldn’t be updated. Your current week is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-175 flex-col gap-5 px-page-inline pt-5 pb-8">
      <p className="text-12 font-bold tracking-label text-leaf uppercase">
        {isHousehold ? "Household" : "Private"} week
      </p>
      <h1 className="font-display text-30 font-semibold tracking-title">
        {past.length ? "Review remaining meals" : "Review your new week"}
      </h1>
      <p className="text-15 leading-relaxed text-graphite">
        {isHousehold
          ? "Your current shared week stays in place until you apply these changes."
          : "Your current week stays in place until you apply these changes."}
      </p>
      {past.length ? (
        <p className="rounded-sm bg-mist p-3 text-14 text-graphite">
          {past.length} earlier{" "}
          {past.length === 1 ? "meal stays" : "meals stay"} unchanged.
        </p>
      ) : null}
      <ul className="border-t border-border">
        {remaining.map((slot) => (
          <li
            key={slot.date}
            className="flex flex-col gap-1 border-b border-border py-4"
          >
            <p className="text-12 font-semibold uppercase text-graphite">
              {formatPlanWeekdayLong(slot.date)}
            </p>
            <p className="font-display text-22 font-semibold text-ink">
              {slot.title}
            </p>
            {slot.isChanged ? (
              <p className="text-14 text-graphite">Was: {slot.previousTitle}</p>
            ) : (
              <p className="text-14 text-graphite">Unchanged</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-14 leading-relaxed text-graphite">
        Shopping extras stay. Checks on ingredients you still need stay too.
      </p>
      <Button
        className="mt-auto"
        disabled={busy}
        onClick={() => void applyReviewed()}
      >
        {busy
          ? "Updating…"
          : past.length
            ? "Update remaining meals"
            : isHousehold
              ? "Replace shared week"
              : "Replace private week"}
      </Button>
      <ButtonLink href="/week" variant="secondary">
        Keep current week
      </ButtonLink>
    </main>
  );
}
