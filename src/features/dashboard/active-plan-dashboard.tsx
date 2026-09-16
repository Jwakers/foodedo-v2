"use client";

import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { FunctionReturnType } from "convex/server";

import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  formatPlanWeekdayUpper,
  resolveActivePlanFocus,
  resolveActivePlanRestOfWeek,
  type ActivePlanMealSlot,
} from "@/lib/domain/plan-display";
import { selectDashboardWeekIdeas } from "@/lib/domain/standard-catalogue";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { markUnfinishedInteraction } from "@/lib/ui/unfinished-interaction";

type ActiveMealPlan = NonNullable<
  FunctionReturnType<typeof api.mealPlans.getCurrent>
>;

export function ActivePlanDashboard({ plan }: { plan: ActiveMealPlan }) {
  const focus = resolveActivePlanFocus({ mealSlots: plan.mealSlots });
  const restOfWeek = resolveActivePlanRestOfWeek({
    mealSlots: plan.mealSlots,
    focusDate: focus?.meal.date ?? null,
  });
  const nudgeImage =
    selectDashboardWeekIdeas(1)[0]?.imageSrc ??
    "/images/recipes/fish-tacos.jpg";

  return (
    <section
      aria-labelledby="active-plan-heading"
      className="mx-auto flex w-full max-w-175 flex-col gap-5 pb-2"
    >
      <h1 id="active-plan-heading" className="sr-only">
        Your week
      </h1>

      {focus ? <TonightFocus focus={focus} /> : <EmptyTonightNotice />}

      {restOfWeek.length > 0 ? <RestOfWeekCarousel meals={restOfWeek} /> : null}

      <ShoppingListReadyStub />
      <SaveRecipesNudge imageSrc={nudgeImage} />
    </section>
  );
}

function TonightFocus({
  focus,
}: {
  focus: NonNullable<ReturnType<typeof resolveActivePlanFocus>>;
}) {
  const { meal, timingLabel, durationLabel } = focus;
  const overline = durationLabel
    ? `${timingLabel} · ${durationLabel.toUpperCase()}`
    : timingLabel;
  const href = meal.catalogueMealSlug
    ? recipeDetailPath(meal.catalogueMealSlug)
    : null;

  return (
    <article className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-leaf"
        />
        <p className="text-12 font-bold tracking-overline text-graphite uppercase">
          {overline}
        </p>
      </div>

      <div className="relative aspect-[316/190] overflow-hidden rounded-compact bg-mist">
        {meal.imageSrc ? (
          <Image
            src={meal.imageSrc}
            alt=""
            fill
            priority
            sizes="(min-width: 640px) 700px, calc(100vw - 40px)"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-30 font-semibold tracking-title text-ink">
          {href ? (
            <Link
              href={href}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            >
              {meal.title}
            </Link>
          ) : (
            meal.title
          )}
        </h2>
        {meal.description ? (
          <p className="text-16 leading-relaxed text-graphite">
            {meal.description}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button
          className="min-w-0 flex-1"
          onClick={() => {
            markUnfinishedInteraction("Cook mode comes next.");
          }}
        >
          Cook this meal
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>
        <Button
          variant="secondary"
          className="shrink-0 px-5"
          onClick={() => {
            markUnfinishedInteraction("Swapping tonight’s meal comes next.");
          }}
        >
          Swap
        </Button>
      </div>
    </article>
  );
}

function EmptyTonightNotice() {
  return (
    <div className="rounded-surface bg-mist p-4">
      <p className="font-display text-22 font-semibold text-ink">
        No dinners left this week
      </p>
      <p className="mt-1 text-14 text-graphite">
        Plan another week when you’re ready for the next round.
      </p>
      <ButtonLink href="/week" className="mt-3 w-full">
        Plan my week
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </ButtonLink>
    </div>
  );
}

function RestOfWeekCarousel({ meals }: { meals: ActivePlanMealSlot[] }) {
  return (
    <section
      aria-labelledby="rest-of-week-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="rest-of-week-heading"
          className="font-display text-22 font-semibold leading-6.5 text-ink"
        >
          The rest of your week
        </h2>
        <ButtonLink href="/week" variant="inline" className="shrink-0 text-ink">
          Full week
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>

      <div className="-mx-page-inline overflow-x-auto pb-1 scrollbar-none sm:-mx-8">
        <ul className="flex w-max snap-x snap-mandatory gap-2 px-page-inline sm:px-8">
          {meals.map((meal) => (
            <li key={meal.date} className="w-[111px] shrink-0 snap-start">
              <RestOfWeekCard meal={meal} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RestOfWeekCard({ meal }: { meal: ActivePlanMealSlot }) {
  const href = meal.catalogueMealSlug
    ? recipeDetailPath(meal.catalogueMealSlug)
    : null;
  const content = (
    <>
      <div className="relative aspect-[111/70] overflow-hidden rounded-sm bg-mist">
        {meal.imageSrc ? (
          <Image
            src={meal.imageSrc}
            alt=""
            fill
            sizes="111px"
            className="object-cover"
          />
        ) : null}
      </div>
      <p className="text-11 font-bold tracking-overline text-graphite uppercase">
        {formatPlanWeekdayUpper(meal.date)}
      </p>
      <p className="line-clamp-2 font-display text-16 font-semibold leading-4.5 text-ink">
        {meal.title}
      </p>
    </>
  );

  if (!href) {
    return <div className="flex flex-col gap-1.5">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
    >
      {content}
    </Link>
  );
}

function ShoppingListReadyStub() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-surface bg-leaf-soft px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-leaf-soft">
          <Check aria-hidden="true" className="size-4" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-14 font-bold text-ink">
            Shopping list coming soon
          </p>
          <p className="text-12 text-graphite">Built from your saved week</p>
        </div>
      </div>
      <Button variant="inline" className="shrink-0 text-leaf" disabled>
        Coming soon
      </Button>
    </div>
  );
}

function SaveRecipesNudge({ imageSrc }: { imageSrc: string }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-border pt-4.5">
      <div className="relative size-[72px] shrink-0 overflow-hidden rounded-compact bg-mist">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="72px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-11 font-bold tracking-overline text-graphite uppercase">
          Make future weeks yours
        </p>
        <p className="font-display text-18 font-semibold text-ink">
          Save recipes you love
        </p>
        <ButtonLink href="/recipes" variant="inline" className="mt-1 text-leaf">
          Browse recipes
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>
    </div>
  );
}
