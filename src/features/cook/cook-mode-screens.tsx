"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  List,
  Timer,
  X,
} from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  CookTimerStrip,
  formatDuration,
} from "@/features/cook/cook-timer-strip";
import type { CookSession, CookTimerState } from "@/lib/domain/cook-session";
import { cookTimerId } from "@/lib/domain/cook-session";
import type { ScaledIngredientLine } from "@/lib/domain/ingredient-scaling";
import {
  formatIngredientAmount,
  formatIngredientName,
} from "@/lib/domain/recipe-display";
import type { CatalogueMeal, RecipeTimerCue } from "@/lib/domain/recipes";

type TimerActions = {
  now: number;
  timerMenuId: string | null;
  onTimerToggle: (timerId: string) => void;
  onTimerMenuToggle: (timerId: string) => void;
  onTimerMenuClose: () => void;
  onTimerCancel: (timerId: string) => void;
  onTimerRestart: (timerId: string) => void;
};

export function CookLoading() {
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-175 items-center justify-center bg-paper px-page-inline text-14 text-graphite"
      aria-busy="true"
    >
      Restoring your cook session…
    </main>
  );
}

export function CookHeader({
  title,
  onExit,
  onIngredients,
}: {
  title: string;
  onExit: () => void;
  onIngredients?: () => void;
}) {
  return (
    <header className="flex h-17 items-center justify-between border-b border-border px-page-inline pt-[env(safe-area-inset-top)]">
      <Button
        variant="ghost"
        size="headerIcon"
        aria-label="Exit cook mode"
        onClick={onExit}
      >
        <X className="size-5" />
      </Button>
      <div className="min-w-0 px-3 text-center">
        <p className="font-display text-20 font-semibold text-ink">Cook mode</p>
        <p className="truncate text-10 font-bold tracking-overline text-graphite uppercase">
          {title}
        </p>
      </div>
      {onIngredients ? (
        <Button
          variant="ghost"
          size="headerIcon"
          aria-label="Show ingredients"
          onClick={onIngredients}
        >
          <List className="size-5" />
        </Button>
      ) : (
        <span className="size-11" />
      )}
    </header>
  );
}

export function PreparationScreen({
  meal,
  ingredients,
  session,
  persistenceAvailable,
  onToggle,
  onStart,
  onExit,
}: {
  meal: CatalogueMeal;
  ingredients: ScaledIngredientLine[];
  session: CookSession;
  persistenceAvailable: boolean;
  onToggle: (id: string) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-175 flex-col bg-paper">
      <CookHeader title={meal.title} onExit={onExit} />
      <section className="flex flex-1 flex-col px-page-inline pt-6">
        <PersistenceWarning visible={!persistenceAvailable} />
        <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
          Mise en place · serves {session.servings}
        </p>
        <h1 className="mt-2 font-display text-34 font-semibold tracking-heading text-ink">
          Get everything ready
        </h1>
        <p className="mt-1 text-15 text-graphite">
          Prep these ingredients before you start cooking.
        </p>
        {meal.preheat ? (
          <div className="mt-5 flex items-center gap-3 rounded-compact bg-mist p-3">
            <Timer className="size-5 text-leaf" />
            <div>
              <p className="text-11 font-bold tracking-label text-graphite uppercase">
                Before you start
              </p>
              <p className="text-15 font-semibold text-ink">
                Preheat oven to {meal.preheat.temperatureC}°C
              </p>
            </div>
          </div>
        ) : null}
        <ul className="mt-4 border-t border-border">
          {ingredients.map((line) => {
            const checked = session.preparedIngredientIds.includes(line.id);
            return (
              <li
                key={line.id}
                className="flex min-h-17 items-center gap-3 border-b border-border"
              >
                <button
                  type="button"
                  aria-pressed={checked}
                  aria-label={`Mark ${line.name} prepared`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full"
                  onClick={() => onToggle(line.id)}
                >
                  <span
                    className={
                      checked
                        ? "flex size-9 items-center justify-center rounded-full bg-leaf text-paper"
                        : "size-9 rounded-full border-2 border-control-muted"
                    }
                  >
                    {checked ? <Check className="size-4" /> : null}
                  </span>
                </button>
                <div>
                  <p className="text-15 font-semibold text-ink">
                    {formatIngredientAmount(line)} {line.name}
                  </p>
                  {line.note ? (
                    <p className="text-14 text-graphite">{line.note}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <footer className="border-t border-border px-page-inline pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-center text-11 text-graphite">
          Your screen will stay awake while you’re cooking
        </p>
        <Button className="w-full" onClick={onStart}>
          I’m ready — start cooking
          <ArrowRight className="size-4" />
        </Button>
      </footer>
    </main>
  );
}

export function StepScreen({
  meal,
  session,
  persistenceAvailable,
  onExit,
  onIngredients,
  onPrevious,
  onNext,
  onStartTimer,
  ...timerActions
}: {
  meal: CatalogueMeal;
  session: CookSession & { phase: { name: "step"; stepIndex: number } };
  persistenceAvailable: boolean;
  onExit: () => void;
  onIngredients: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onStartTimer: (stepId: string, cue: RecipeTimerCue) => void;
} & TimerActions) {
  const step = meal.steps[session.phase.stepIndex]!;
  const timersById = new Set(session.timers.map((timer) => timer.id));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-175 flex-col bg-paper">
      <CookHeader
        title={meal.title}
        onExit={onExit}
        onIngredients={onIngredients}
      />
      <section className="flex flex-1 flex-col px-page-inline pt-6 pb-5">
        <PersistenceWarning visible={!persistenceAvailable} />
        <p className="text-13 font-semibold text-graphite">
          Step {session.phase.stepIndex + 1} of {meal.steps.length}
        </p>
        <div className="mt-3 h-0.75 rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-ink"
            style={{
              width: `${((session.phase.stepIndex + 1) / meal.steps.length) * 100}%`,
            }}
          />
        </div>
        <TimerList timers={session.timers} {...timerActions} />
        <p className="mt-7 font-display text-34 font-semibold leading-10 tracking-heading text-ink">
          {step.text}
        </p>
        {step.timerCues?.map((cue) => {
          if (timersById.has(cookTimerId(step.id, cue.id))) return null;
          return (
            <Button
              key={cue.id}
              variant="secondary"
              className="mt-6 justify-between border-0 bg-leaf-soft text-leaf shadow-none"
              onClick={() => onStartTimer(step.id, cue)}
            >
              <span className="flex items-center gap-2">
                <Timer className="size-4" />
                Start {formatDuration(cue.durationSeconds)} timer
              </span>
              <ArrowRight className="size-4" />
            </Button>
          );
        })}
      </section>
      <footer className="flex items-center gap-3 border-t border-border px-page-inline pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Button
          variant="inline"
          className="min-h-11 shrink-0 px-2 text-graphite"
          onClick={onPrevious}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button className="min-w-0 flex-1" onClick={onNext}>
          {session.phase.stepIndex === meal.steps.length - 1
            ? "Dinner’s ready"
            : "Next step"}
          <ArrowRight className="size-4" />
        </Button>
      </footer>
    </main>
  );
}

export function IngredientsScreen({
  meal,
  ingredients,
  session,
  persistenceAvailable,
  onBack,
  ...timerActions
}: {
  meal: CatalogueMeal;
  ingredients: ScaledIngredientLine[];
  session: CookSession;
  persistenceAvailable: boolean;
  onBack: () => void;
} & TimerActions) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-175 bg-paper">
      <header className="flex h-17 items-center border-b border-border px-page-inline pt-[env(safe-area-inset-top)]">
        <Button
          variant="ghost"
          size="headerIcon"
          aria-label="Back to cooking"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="flex-1 text-center font-display text-24 font-semibold text-ink">
          Ingredients
        </h1>
        <span className="size-11" />
      </header>
      <section className="px-page-inline pt-6">
        <PersistenceWarning visible={!persistenceAvailable} />
        <div className="flex justify-between gap-3">
          <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
            {meal.title}
          </p>
          <p className="text-13 text-graphite">Scaled for {session.servings}</p>
        </div>
        <TimerList timers={session.timers} {...timerActions} />
        <ul className="mt-5 border-t border-border">
          {ingredients.map((line) => (
            <li
              key={line.id}
              className="flex min-h-13 gap-3 border-b border-border py-2"
            >
              <span className="w-20 shrink-0 text-14 font-semibold text-ink">
                {formatIngredientAmount(line)}
              </span>
              <span className="text-14 text-ink">
                {formatIngredientName(line)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export function CompleteScreen({
  meal,
  onRecipe,
  onWeek,
  onExit,
}: {
  meal: CatalogueMeal;
  onRecipe: () => void;
  onWeek: () => void;
  onExit: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-175 flex-col bg-paper px-page-inline pt-[env(safe-area-inset-top)]">
      <div className="flex justify-end py-3">
        <Button
          variant="ghost"
          size="headerIcon"
          aria-label="Close"
          onClick={onExit}
        >
          <X className="size-5" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center pb-18 text-center">
        {meal.imageSrc ? (
          <div className="relative h-55 w-full overflow-hidden rounded-hero bg-mist">
            <Image
              src={meal.imageSrc}
              alt=""
              fill
              sizes="(max-width: 700px) 100vw, 700px"
              className="object-cover"
            />
          </div>
        ) : null}
        <p className="mt-8 text-12 font-bold tracking-overline text-leaf uppercase">
          Dinner’s ready
        </p>
        <h1 className="mt-2 font-display text-24 font-semibold text-ink">
          {meal.title}
        </h1>
        <p className="mt-1 text-14 text-graphite">Time to serve.</p>
        <div className="mt-8 w-full">
          <Button className="w-full" onClick={onWeek}>
            Back to my week
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={onRecipe}>
            Back to recipe
          </Button>
        </div>
      </div>
    </main>
  );
}

function TimerList({
  timers,
  now,
  timerMenuId,
  onTimerToggle,
  onTimerMenuToggle,
  onTimerMenuClose,
  onTimerCancel,
  onTimerRestart,
}: { timers: CookTimerState[] } & TimerActions) {
  return timers.map((timer) => (
    <CookTimerStrip
      key={timer.id}
      timer={timer}
      now={now}
      onToggle={() => onTimerToggle(timer.id)}
      menuOpen={timerMenuId === timer.id}
      onMenuToggle={() => onTimerMenuToggle(timer.id)}
      onMenuClose={onTimerMenuClose}
      onCancel={() => onTimerCancel(timer.id)}
      onRestart={() => onTimerRestart(timer.id)}
    />
  ));
}

function PersistenceWarning({ visible }: { visible: boolean }) {
  return visible ? (
    <p
      className="mb-4 rounded-compact bg-mist px-3 py-2 text-12 text-graphite"
      role="status"
    >
      Progress will stay available while this screen remains open, but this
      device could not save it for recovery.
    </p>
  ) : null;
}
