"use client";

import { useConvex } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  DashboardCarousel,
  DashboardCarouselCard,
  DashboardCarouselItem,
  DashboardCarouselList,
} from "@/features/dashboard/dashboard-carousel";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "@/features/household/household-context";
import { useLocalPlanExclusions } from "@/features/dashboard/use-local-plan-exclusions";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import { todayPlanDate } from "@/lib/domain/plan-display";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import { recipeDetailPath } from "@/lib/routing/recipes";

type DiscoveryProps = { className?: string; hasSavedPlan?: boolean };

export function MealsYouMightLike(props: DiscoveryProps) {
  const { spaceKey } = useHouseholdSpace();
  const [attempt, setAttempt] = useState(0);
  // Scope changes and explicit retries start a fresh request. Saves do not.
  return (
    <DiscoveryForSpace
      key={`${spaceKey}:${props.hasSavedPlan ?? false}:${attempt}`}
      {...props}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  );
}

function DiscoveryForSpace({
  className,
  hasSavedPlan = false,
  onRetry,
}: DiscoveryProps & { onRetry: () => void }) {
  const { status } = useFoodedoAuth();
  const { spaceArgs, spaceKey, ready } = useHouseholdSpace();
  const library = useCatalogueRecipeLibrary();
  const client = useConvex();
  const [day] = useState(todayPlanDate);
  const localPlan = useLocalPlanExclusions(!hasSavedPlan, spaceKey);
  const [result, setResult] = useState<
    | { status: "loading" }
    | { status: "ready"; meals: CatalogueMealSummary[] }
    | { status: "error" }
  >({ status: "loading" });
  const householdId = spaceArgs.householdId;

  useEffect(() => {
    if (
      !ready ||
      (status !== "guest" && status !== "authenticated") ||
      localPlan.status !== "ready"
    )
      return;
    let cancelled = false;
    const localPlannedMealIds = localPlan.mealIds;
    async function loadDiscovery() {
      try {
        // This row is deliberately a snapshot. A live subscription would
        // rerank after every save even though these cards must stay put.
        const meals = await client.query(api.catalogue.getDiscovery, {
          householdId,
          day,
          localPlannedMealIds,
        });
        if (!cancelled) setResult({ status: "ready", meals });
      } catch (error) {
        console.error("Failed to load recipe discovery.", error);
        if (!cancelled) setResult({ status: "error" });
      }
    }
    void loadDiscovery();
    return () => {
      cancelled = true;
    };
  }, [client, day, householdId, localPlan, ready, status]);

  if (status === "connection_error") return null;
  const unavailable = localPlan.status === "error" || result.status === "error";
  const loading =
    !unavailable && (result.status === "loading" || library.isLibraryLoading);

  if (loading || unavailable) {
    return (
      <DashboardCarousel
        headingId="discovery-heading"
        title="Meals you might like"
        href="/recipes"
        action="Browse recipes"
        className={className}
      >
        <div
          className="px-page-inline text-13 text-graphite sm:px-8"
          role="status"
        >
          <p>
            {loading
              ? "Finding meals to discover…"
              : "Recipe suggestions are unavailable right now."}
          </p>
          {!loading ? (
            <Button
              variant="inline"
              className="mt-1 h-auto p-0 text-13"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : null}
        </div>
      </DashboardCarousel>
    );
  }
  if (result.status !== "ready") return null;
  return <DiscoverySelection meals={result.meals} className={className} />;
}

function DiscoverySelection({
  meals,
  className,
}: {
  meals: CatalogueMealSummary[];
  className?: string;
}) {
  if (meals.length === 0) return null;

  return (
    <DashboardCarousel
      headingId="discovery-heading"
      title="Meals you might like"
      href="/recipes"
      action="Browse recipes"
      className={className}
    >
      <DashboardCarouselList>
        {meals.map((meal) => (
          <DashboardCarouselItem key={meal.id}>
            <DashboardCarouselCard
              title={meal.title}
              imageSrc={meal.imageSrc}
              href={recipeDetailPath(meal.slug)}
              meal={meal}
            />
          </DashboardCarouselItem>
        ))}
      </DashboardCarouselList>
    </DashboardCarousel>
  );
}
