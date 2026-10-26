"use client";

import { HomeIntroduction } from "@/features/onboarding/contextual-introductions";
import { HouseholdDiscovery } from "@/features/household/household-discovery";
import { useHouseholdSpace } from "@/features/household/household-context";

import { useQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button, ButtonLink } from "@/components/ui/button";
import { LatestRecipesCarousel } from "@/features/dashboard/latest-recipes-carousel";
import { ActivePlanDashboard } from "@/features/dashboard/active-plan-dashboard";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import { PlanAction } from "@/features/plan/plan-action";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

export function Dashboard() {
  const { household, spaceArgs, ready: spaceReady } = useHouseholdSpace();
  const catalogue = useCurrentCatalogue();
  const { status, isAuthenticated } = useFoodedoAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
  );

  // Resolve Clerk before choosing guest/account UI. Signed-in users also wait
  // for Convex so Home never flashes the guest “Plan my week” state.
  const isCheckingPlan =
    status === "loading" ||
    !spaceReady ||
    (isAuthenticated && currentPlan === undefined);

  if (isCheckingPlan) {
    return (
      <section
        aria-label="Loading your dashboard"
        className="mx-auto w-full max-w-175"
        aria-busy="true"
      >
        <div className="h-8 w-28 rounded-sm bg-mist" />
        <div className="mt-3 h-12 w-56 rounded-sm bg-mist" />
        <div className="mt-6 h-52 rounded-hero bg-mist sm:h-72" />
      </section>
    );
  }

  if (status === "connection_error") {
    return <AccountConnectionError embedded />;
  }

  if (currentPlan) {
    return (
      <>
        <ActivePlanDashboard plan={currentPlan} />
        {isAuthenticated && household === null ? <HouseholdDiscovery /> : null}
      </>
    );
  }

  return (
    <section
      aria-labelledby="dashboard-heading"
      className="mx-auto w-full max-w-175"
    >
      <DashboardIntroduction />
      <DashboardImage />
      <PlanAction />
      <HomeIntroduction />
      <IdeasForYourWeek catalogue={catalogue} />
      <div className="mt-6">
        <LatestRecipesCarousel />
      </div>
    </section>
  );
}

function DashboardIntroduction() {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
        Your week
      </p>
      <h1
        id="dashboard-heading"
        className="font-display text-42 font-semibold tracking-display text-ink"
      >
        Dinner, decided.
      </h1>
      <p className="max-w-136 text-16 leading-relaxed text-graphite">
        One clear place for the next useful food decision.
      </p>
    </div>
  );
}

function DashboardImage() {
  return (
    <div className="relative mt-6 h-52 overflow-hidden rounded-hero sm:h-72">
      <Image
        src="/images/recipes/fish-tacos.jpg"
        alt="Crisp fish tacos with cabbage, lime and fresh herbs"
        fill
        priority
        sizes="(min-width: 640px) 700px, calc(100vw - 36px)"
        className="object-cover"
      />
    </div>
  );
}

function IdeasForYourWeek({
  catalogue,
}: {
  catalogue: ReturnType<typeof useCurrentCatalogue>;
}) {
  const ideas = catalogue?.meals.slice(0, 6) ?? [];

  return (
    <section
      aria-labelledby="week-ideas-heading"
      className="mt-5 flex flex-col gap-3 border-t border-border pt-4.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="week-ideas-heading"
          className="font-display text-22 font-semibold leading-6.5 text-ink"
        >
          Ideas for your week
        </h2>
        <ButtonLink
          href="/recipes"
          variant="inline"
          className="shrink-0 text-ink"
        >
          Browse recipes
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>

      <div className="-mx-page-inline overflow-x-auto pb-1 scrollbar-none sm:-mx-8">
        {catalogue === undefined ? (
          <p className="px-page-inline text-13 text-graphite sm:px-8">
            Loading ideas…
          </p>
        ) : null}
        {catalogue === null ? (
          <div className="px-page-inline text-13 text-graphite sm:px-8">
            <p>Recipe ideas are unavailable right now.</p>
            <Button
              variant="inline"
              className="mt-1 h-auto p-0 text-13"
              onClick={() => window.location.reload()}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {catalogue?.meals.length === 0 ? (
          <p className="px-page-inline text-13 text-graphite sm:px-8">
            No recipe ideas are available yet.
          </p>
        ) : null}
        <ul className="flex w-max snap-x snap-mandatory gap-2 px-page-inline sm:px-8">
          {ideas.map((meal) => (
            <li key={meal.id} className="w-37 shrink-0 snap-start">
              <WeekIdeaCard meal={meal} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WeekIdeaCard({ meal }: { meal: CatalogueMealSummary }) {
  return (
    <Link
      href={recipeDetailPath(meal.slug)}
      className="flex flex-col gap-1.75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
    >
      <div className="relative aspect-37/24 overflow-hidden rounded-compact bg-mist">
        {meal.imageSrc ? (
          <Image
            src={meal.imageSrc}
            alt=""
            fill
            sizes="148px"
            className="object-cover"
          />
        ) : null}
      </div>
      <p className="line-clamp-3 font-display text-16 font-semibold leading-4.5 text-ink">
        {meal.title}
      </p>
    </Link>
  );
}
