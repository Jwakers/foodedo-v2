"use client";
import { trackPlanSaved } from "@/lib/analytics";
import { useState } from "react";
import Image from "next/image";
import { Utensils } from "lucide-react";
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
  formatPlanDateRange,
  formatMealDurationLabel,
} from "@/lib/domain/plan-display";
import { PlanReviewLoading } from "./plan-review-loading";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";

export function ReplanReview() {
  const { status, isAuthenticated, userId } = useFoodedoAuth();
  const { spaceArgs, ready, isHousehold, spaceKey } = useHouseholdSpace();
  const params = useSearchParams();
  const sourceId = params.get("plan");
  const revision = Number(params.get("revision"));
  const origin = params.get("space");
  const [variant] = useState(1);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const proposal = useQuery(
    api.mealPlans.getRegenerationProposal,
    isAuthenticated && ready && origin === spaceKey
      ? { ...spaceArgs, variant }
      : "skip",
  );
  const current = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated && ready ? spaceArgs : "skip",
  );
  const apply = useMutation(api.mealPlans.applyRegenerationProposal);
  const undo = useMutation(api.mealPlans.undoPlanReplacement);
  const router = useRouter();
  const catalogue = useCurrentCatalogue();
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
          Your plan couldn’t be replanned
        </h1>
        <ButtonLink href="/week">Return to Week</ButtonLink>
      </main>
    );
  const reviewed = proposal;
  async function applyReviewed() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apply({
        ...spaceArgs,
        sourcePlanId: reviewed.sourcePlanId,
        sourceUpdatedAt: reviewed.sourceUpdatedAt,
        variant: reviewed.variant,
      });
      if (result.status !== "applied") {
        setChanged(true);
        return;
      }
      trackPlanSaved(
        result.mealPlanId,
        { is_guest_claim: false, meal_count: reviewed.mealSlots.length },
        userId,
      );
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
    <main className="mx-auto flex w-full max-w-175 flex-col gap-5 px-page-inline pt-5 pb-8">
      <div className="flex flex-col gap-1.5">
        <p className="text-12 font-bold tracking-label text-leaf uppercase">
          {isHousehold ? "Household" : "Private"} week
        </p>
        <h1 className="font-display text-30 font-semibold tracking-title">
          Review your new meals
        </h1>
        <p className="text-15 leading-relaxed text-graphite">
          {formatPlanDateRange(current)} · serves {current.servings}
        </p>
      </div>
      <ul className="border-t border-border">
        {reviewed.mealSlots.map((slot) => {
          const savedSlot = current.mealSlots.find(
            (meal) => meal.date === slot.date,
          );
          const imageSrc = !slot.isChanged
            ? savedSlot?.imageSrc
            : slot.catalogueMealId
              ? catalogue?.meals.find(
                  (meal) => meal.id === slot.catalogueMealId,
                )?.imageSrc
              : null;
          const duration = formatMealDurationLabel(
            slot.prepMinutes ?? undefined,
            slot.cookMinutes ?? undefined,
          );
          return (
            <li
              key={slot.date}
              className="flex items-center gap-2.5 border-b border-border py-3"
            >
              <div className="relative flex h-18 w-20.5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-mist">
                {imageSrc ? (
                  <Image
                    src={imageSrc}
                    alt=""
                    width={82}
                    height={72}
                    sizes="82px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Utensils
                    aria-hidden="true"
                    className="size-6 text-graphite"
                    strokeWidth={1.5}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-display text-18 font-semibold leading-snug tracking-card text-ink">
                  {formatRecipeHeading(slot.title)}
                </p>
                {duration ? (
                  <p className="text-12 text-graphite">{duration}</p>
                ) : null}
                {slot.servingNotice ? (
                  <p className="text-12 text-graphite">{slot.servingNotice}</p>
                ) : null}
                {slot.isChanged ? (
                  <p className="text-12 text-graphite">
                    Was: {formatRecipeHeading(slot.previousTitle)}
                  </p>
                ) : (
                  <p className="text-12 text-graphite">Unchanged</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2">
        <p className="text-13 leading-5 text-graphite">
          Your current week stays until you apply these changes. Shopping extras
          and checks on ingredients still needed stay too.
        </p>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void applyReviewed()}
        >
          {busy
            ? "Updating…"
            : isHousehold
              ? "Replace shared week"
              : "Replace private week"}
        </Button>
        <ButtonLink href="/week" variant="secondary">
          Keep current week
        </ButtonLink>
      </div>
    </main>
  );
}
