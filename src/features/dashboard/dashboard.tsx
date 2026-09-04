"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
} from "@clerk/react";
import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button, ButtonLink } from "@/components/ui/button";
import { PlanAction } from "@/features/dashboard/plan-action";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { selectDashboardWeekIdeas } from "@/lib/domain/standard-catalogue";

export function Dashboard() {
  return (
    <section
      aria-labelledby="dashboard-heading"
      className="mx-auto w-full max-w-175"
    >
      <DashboardIntroduction />
      <DashboardImage />
      <PlanAction />
      <AccountNotice />
      <IdeasForYourWeek />
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

function AccountNotice() {
  return (
    <>
      <ClerkLoading>
        <div
          className="mt-4 h-19 rounded-surface bg-mist"
          aria-label="Checking account status"
        />
      </ClerkLoading>

      <ClerkFailed>
        <p className="mt-4 rounded-surface bg-cadmium-soft p-4 text-13 text-danger">
          Account status is temporarily unavailable.
        </p>
      </ClerkFailed>

      <ClerkLoaded>
        <Show when="signed-out">
          <div className="mt-4 flex items-start gap-3 rounded-surface bg-leaf-soft p-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-leaf text-leaf-soft">
              <Check aria-hidden="true" className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-14 font-bold text-ink">
                Try it first, save it later
              </p>
              <p className="mt-1 text-13 text-graphite">
                Plan your week now. Sign in when you want to keep it.
              </p>
              <SignInButton mode="modal">
                <Button variant="inline" className="mt-1 text-leaf">
                  Sign in
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Button>
              </SignInButton>
            </div>
          </div>
        </Show>
      </ClerkLoaded>
    </>
  );
}

function IdeasForYourWeek() {
  const ideas = selectDashboardWeekIdeas();

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

function WeekIdeaCard({ meal }: { meal: CatalogueMeal }) {
  return (
    <Link
      href={`/recipes/${meal.slug}`}
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
