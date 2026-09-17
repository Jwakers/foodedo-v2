"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CompleteScreen,
  CookLoading,
  IngredientsScreen,
  PreparationScreen,
  StepScreen,
} from "@/features/cook/cook-mode-screens";
import {
  useCookScrollRecovery,
  useCookSession,
} from "@/features/cook/use-cook-session";
import {
  remainingTimerSeconds,
  type CookRecipeContext,
  type CookSessionAction,
} from "@/lib/domain/cook-session";
import { scaleIngredients } from "@/lib/domain/ingredient-scaling";
import type { CatalogueMeal, RecipeTimerCue } from "@/lib/domain/recipes";
import { setCookScreenAwake } from "@/lib/platform/capacitor/cook-screen";
import { recipeDetailPath } from "@/lib/routing/recipes";

export function CookModePage({
  meal,
  catalogueVersion,
}: {
  meal: CatalogueMeal;
  catalogueVersion: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const servings = parseServings(searchParams.get("servings"), meal.servings);
  const context = useMemo<CookRecipeContext>(
    () => ({ catalogueVersion, meal, servings }),
    [catalogueVersion, meal, servings],
  );
  const { session, dispatch, loaded, persistenceAvailable, complete } =
    useCookSession(context);
  const [timerMenuId, setTimerMenuId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ingredients = useMemo(
    () => scaleIngredients(meal.ingredients, meal.servings, session.servings),
    [meal.ingredients, meal.servings, session.servings],
  );
  const hasRunningTimer = session.timers.some(
    (timer) =>
      timer.startedAt !== null && remainingTimerSeconds(timer, now) > 0,
  );
  const cooking = loaded && session.phase.name !== "complete";

  useEffect(() => {
    if (!hasRunningTimer) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasRunningTimer]);

  useEffect(() => {
    void setCookScreenAwake(cooking);
    return () => {
      void setCookScreenAwake(false);
    };
  }, [cooking]);

  const surface =
    session.phase.name === "preparation"
      ? "preparation"
      : session.phase.name === "ingredients"
        ? "ingredients"
        : "step";
  const scrollKey =
    session.phase.name === "step"
      ? `step:${session.phase.stepIndex}`
      : surface;
  useCookScrollRecovery({
    loaded: loaded && session.phase.name !== "complete",
    surface,
    scrollKey,
    scrollTop: session.scrollPositions[surface],
    dispatch,
  });

  const exit = () => {
    void setCookScreenAwake(false);
    router.push(recipeDetailPath(meal.slug));
  };
  const dispatchAtCurrentTime = (
    action: Omit<
      Extract<CookSessionAction, { type: "toggle-timer" | "restart-timer" }>,
      "now"
    >,
  ) => {
    const currentTime = Date.now();
    setNow(currentTime);
    dispatch({ ...action, now: currentTime } as CookSessionAction);
  };
  const startTimer = (stepId: string, cue: RecipeTimerCue) => {
    const currentTime = Date.now();
    setNow(currentTime);
    dispatch({ type: "start-timer", stepId, cue, now: currentTime });
  };
  const closeTimerMenu = useCallback(() => setTimerMenuId(null), []);
  const timerActions = {
    now,
    timerMenuId,
    onTimerToggle: (timerId: string) =>
      dispatchAtCurrentTime({ type: "toggle-timer", timerId }),
    onTimerMenuToggle: (timerId: string) =>
      setTimerMenuId((current) => (current === timerId ? null : timerId)),
    onTimerMenuClose: closeTimerMenu,
    onTimerCancel: (timerId: string) => {
      dispatch({ type: "cancel-timer", timerId });
      setTimerMenuId(null);
    },
    onTimerRestart: (timerId: string) => {
      dispatchAtCurrentTime({ type: "restart-timer", timerId });
      setTimerMenuId(null);
    },
  };

  if (!loaded) return <CookLoading />;
  if (session.phase.name === "preparation") {
    return (
      <PreparationScreen
        meal={meal}
        ingredients={ingredients}
        session={session}
        persistenceAvailable={persistenceAvailable}
        onToggle={(ingredientId) =>
          dispatch({ type: "toggle-prepared", ingredientId })
        }
        onStart={() => dispatch({ type: "start-cooking" })}
        onExit={exit}
      />
    );
  }
  if (session.phase.name === "complete") {
    return (
      <CompleteScreen
        meal={meal}
        onRecipe={() => router.push(recipeDetailPath(meal.slug))}
        onWeek={() => router.push("/week")}
        onExit={exit}
      />
    );
  }
  if (session.phase.name === "ingredients") {
    return (
      <IngredientsScreen
        meal={meal}
        ingredients={ingredients}
        session={session}
        persistenceAvailable={persistenceAvailable}
        onBack={() => dispatch({ type: "hide-ingredients" })}
        {...timerActions}
      />
    );
  }

  const stepSession = { ...session, phase: session.phase };
  const stepIndex = session.phase.stepIndex;
  return (
    <StepScreen
      meal={meal}
      session={stepSession}
      persistenceAvailable={persistenceAvailable}
      onExit={exit}
      onIngredients={() => dispatch({ type: "show-ingredients" })}
      onPrevious={() => dispatch({ type: "previous-step" })}
      onNext={() => {
        if (stepIndex === meal.steps.length - 1) complete();
        else dispatch({ type: "next-step", stepCount: meal.steps.length });
      }}
      onStartTimer={startTimer}
      {...timerActions}
    />
  );
}

function parseServings(value: string | null, fallback = 1) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000
    ? parsed
    : fallback;
}
