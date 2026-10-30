"use client";

import { HomeIntroduction } from "@/features/onboarding/contextual-introductions";
import { HouseholdDiscovery } from "@/features/household/household-discovery";
import Image from "next/image";

import { HomeLoadingContent } from "@/components/home-loading";
import { AccountConnectionError } from "@/components/account-connection-error";
import { MealsYouMightLike } from "@/features/dashboard/meals-you-might-like";
import { LatestRecipesCarousel } from "@/features/dashboard/latest-recipes-carousel";
import { ActivePlanDashboard } from "@/features/dashboard/active-plan-dashboard";
import { PlanAction } from "@/features/plan/plan-action";
import { useDashboardState } from "@/features/dashboard/use-dashboard-state";

const dashboardImages = [
  {
    src: "/images/recipes/fish-tacos.webp",
    alt: "Fish tacos with cabbage slaw, avocado and lime",
  },
  {
    src: "/images/welcome/pasta-primavera.webp",
    alt: "Pasta primavera with colourful vegetables and grated cheese",
  },
  {
    src: "/images/welcome/chicken-shawarma.webp",
    alt: "Chicken shawarma pittas with salad and yogurt sauce",
  },
  {
    src: "/images/welcome/chickpea-curry.webp",
    alt: "Creamy coconut chickpea curry with spinach and rice",
  },
] as const;

export function Dashboard() {
  const { auth, household, currentPlan, isCheckingPlan } = useDashboardState();
  const { status, isAuthenticated } = auth;

  if (isCheckingPlan) {
    return <HomeLoadingContent />;
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
      <DashboardMealCollage />
      <PlanAction />
      <HomeIntroduction />
      <MealsYouMightLike className="mt-5 border-t border-border pt-4.5" />
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

function DashboardMealCollage() {
  return (
    <figure className="mt-6 grid h-52 grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-hero sm:h-72">
      <figcaption className="sr-only">
        A taste of the meals you could plan this week
      </figcaption>
      {dashboardImages.map(({ src, alt }) => (
        <div key={src} className="relative min-h-0 min-w-0 bg-mist">
          <Image
            src={src}
            alt={alt}
            fill
            preload
            sizes="(min-width: 736px) 346px, calc((100vw - 44px) / 2)"
            className="object-cover"
          />
        </div>
      ))}
    </figure>
  );
}
