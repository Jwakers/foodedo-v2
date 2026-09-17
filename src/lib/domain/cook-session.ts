import type { CatalogueMeal, RecipeTimerCue } from "./recipes";

export const COOK_SESSION_SCHEMA_VERSION = 1;

export type CookPhase =
  | { name: "preparation" }
  | { name: "step"; stepIndex: number }
  | { name: "ingredients"; returnStepIndex: number }
  | { name: "complete" };

export type CookTimerState = {
  id: string;
  stepId: string;
  cueId: string;
  label: string;
  durationSeconds: number;
  startedAt: number | null;
  remainingSeconds: number;
};

export type CookScrollPositions = {
  preparation: number;
  step: number;
  ingredients: number;
};

export type CookSession = {
  schemaVersion: typeof COOK_SESSION_SCHEMA_VERSION;
  catalogueVersion: number;
  recipeSlug: string;
  servings: number;
  phase: CookPhase;
  preparedIngredientIds: string[];
  scrollPositions: CookScrollPositions;
  timers: CookTimerState[];
};

export type CookRecipeContext = {
  catalogueVersion: number;
  meal: CatalogueMeal;
  servings: number;
};

export type CookSessionAction =
  | { type: "replace"; session: CookSession }
  | { type: "toggle-prepared"; ingredientId: string }
  | { type: "start-cooking" }
  | { type: "previous-step" }
  | { type: "next-step"; stepCount: number }
  | { type: "show-ingredients" }
  | { type: "hide-ingredients" }
  | {
      type: "start-timer";
      stepId: string;
      cue: RecipeTimerCue;
      now: number;
    }
  | { type: "toggle-timer"; timerId: string; now: number }
  | { type: "restart-timer"; timerId: string; now: number }
  | { type: "cancel-timer"; timerId: string }
  | {
      type: "set-scroll";
      surface: keyof CookScrollPositions;
      scrollTop: number;
    }
  | { type: "complete" };

export function cookTimerId(stepId: string, cueId: string) {
  return `${stepId}:${cueId}`;
}

export function emptyCookSession({
  catalogueVersion,
  meal,
  servings,
}: CookRecipeContext): CookSession {
  return {
    schemaVersion: COOK_SESSION_SCHEMA_VERSION,
    catalogueVersion,
    recipeSlug: meal.slug,
    servings,
    phase: { name: "preparation" },
    preparedIngredientIds: [],
    scrollPositions: { preparation: 0, step: 0, ingredients: 0 },
    timers: [],
  };
}

export function restoreCookSession(
  value: unknown,
  context: CookRecipeContext,
): CookSession {
  const fallback = emptyCookSession(context);
  if (!isRecord(value)) return fallback;
  if (
    value.schemaVersion !== COOK_SESSION_SCHEMA_VERSION ||
    value.catalogueVersion !== context.catalogueVersion ||
    value.recipeSlug !== context.meal.slug ||
    value.servings !== context.servings
  ) {
    return fallback;
  }

  const phase = restorePhase(value.phase, context.meal.steps.length);
  const scrollPositions = restoreScrollPositions(value.scrollPositions);
  if (phase === null || scrollPositions === null) return fallback;

  const ingredientIds = new Set(
    context.meal.ingredients.map((ingredient) => ingredient.id),
  );
  if (
    !Array.isArray(value.preparedIngredientIds) ||
    !value.preparedIngredientIds.every(
      (id): id is string => typeof id === "string",
    )
  ) {
    return fallback;
  }

  const authoredTimers = new Map<
    string,
    { stepId: string; cue: RecipeTimerCue }
  >();
  for (const step of context.meal.steps) {
    for (const cue of step.timerCues ?? []) {
      authoredTimers.set(cookTimerId(step.id, cue.id), {
        stepId: step.id,
        cue,
      });
    }
  }
  const timers = restoreTimers(value.timers, authoredTimers);
  if (timers === null) return fallback;

  return {
    ...fallback,
    phase,
    preparedIngredientIds: value.preparedIngredientIds.filter((id) =>
      ingredientIds.has(id),
    ),
    scrollPositions,
    timers,
  };
}

export function reduceCookSession(
  session: CookSession,
  action: CookSessionAction,
): CookSession {
  switch (action.type) {
    case "replace":
      return action.session;
    case "toggle-prepared":
      return {
        ...session,
        preparedIngredientIds: session.preparedIngredientIds.includes(
          action.ingredientId,
        )
          ? session.preparedIngredientIds.filter(
              (id) => id !== action.ingredientId,
            )
          : [...session.preparedIngredientIds, action.ingredientId],
      };
    case "start-cooking":
      return {
        ...session,
        phase: { name: "step", stepIndex: 0 },
        scrollPositions: { ...session.scrollPositions, step: 0 },
      };
    case "previous-step": {
      if (session.phase.name !== "step") return session;
      if (session.phase.stepIndex === 0) {
        return { ...session, phase: { name: "preparation" } };
      }
      return {
        ...session,
        phase: { name: "step", stepIndex: session.phase.stepIndex - 1 },
        scrollPositions: { ...session.scrollPositions, step: 0 },
      };
    }
    case "next-step": {
      if (session.phase.name !== "step") return session;
      if (session.phase.stepIndex >= action.stepCount - 1) {
        return { ...session, phase: { name: "complete" } };
      }
      return {
        ...session,
        phase: { name: "step", stepIndex: session.phase.stepIndex + 1 },
        scrollPositions: { ...session.scrollPositions, step: 0 },
      };
    }
    case "show-ingredients":
      if (session.phase.name !== "step") return session;
      return {
        ...session,
        phase: {
          name: "ingredients",
          returnStepIndex: session.phase.stepIndex,
        },
      };
    case "hide-ingredients":
      if (session.phase.name !== "ingredients") return session;
      return {
        ...session,
        phase: { name: "step", stepIndex: session.phase.returnStepIndex },
      };
    case "start-timer": {
      const id = cookTimerId(action.stepId, action.cue.id);
      const existing = session.timers.find((timer) => timer.id === id);
      if (
        existing !== undefined &&
        remainingTimerSeconds(existing, action.now) > 0
      ) {
        return session;
      }
      const timer: CookTimerState = {
        id,
        stepId: action.stepId,
        cueId: action.cue.id,
        label: action.cue.label,
        durationSeconds: action.cue.durationSeconds,
        remainingSeconds: action.cue.durationSeconds,
        startedAt: action.now,
      };
      return {
        ...session,
        timers:
          existing === undefined
            ? [...session.timers, timer]
            : session.timers.map((item) => (item.id === id ? timer : item)),
      };
    }
    case "toggle-timer":
      return {
        ...session,
        timers: session.timers.map((timer) => {
          if (timer.id !== action.timerId) return timer;
          const remaining = remainingTimerSeconds(timer, action.now);
          if (remaining === 0) {
            return {
              ...timer,
              remainingSeconds: timer.durationSeconds,
              startedAt: action.now,
            };
          }
          return timer.startedAt === null
            ? { ...timer, startedAt: action.now }
            : { ...timer, remainingSeconds: remaining, startedAt: null };
        }),
      };
    case "restart-timer":
      return {
        ...session,
        timers: session.timers.map((timer) =>
          timer.id === action.timerId
            ? {
                ...timer,
                remainingSeconds: timer.durationSeconds,
                startedAt: action.now,
              }
            : timer,
        ),
      };
    case "cancel-timer":
      return {
        ...session,
        timers: session.timers.filter((timer) => timer.id !== action.timerId),
      };
    case "set-scroll":
      return {
        ...session,
        scrollPositions: {
          ...session.scrollPositions,
          [action.surface]: Math.max(0, action.scrollTop),
        },
      };
    case "complete":
      return { ...session, phase: { name: "complete" } };
  }
}

export function remainingTimerSeconds(timer: CookTimerState, now = Date.now()) {
  if (timer.startedAt === null) return timer.remainingSeconds;
  const elapsedMilliseconds = Math.max(0, now - timer.startedAt);
  return Math.max(
    0,
    timer.remainingSeconds - Math.floor(elapsedMilliseconds / 1000),
  );
}

function restorePhase(value: unknown, stepCount: number): CookPhase | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  if (value.name === "preparation") return { name: "preparation" };
  if (value.name === "step" && isStepIndex(value.stepIndex, stepCount)) {
    return { name: "step", stepIndex: value.stepIndex };
  }
  if (
    value.name === "ingredients" &&
    isStepIndex(value.returnStepIndex, stepCount)
  ) {
    return { name: "ingredients", returnStepIndex: value.returnStepIndex };
  }
  return null;
}

function restoreScrollPositions(value: unknown): CookScrollPositions | null {
  if (!isRecord(value)) return null;
  const positions = [value.preparation, value.step, value.ingredients];
  if (
    !positions.every(
      (position) =>
        typeof position === "number" &&
        Number.isFinite(position) &&
        position >= 0,
    )
  ) {
    return null;
  }
  return {
    preparation: value.preparation as number,
    step: value.step as number,
    ingredients: value.ingredients as number,
  };
}

function restoreTimers(
  value: unknown,
  authoredTimers: Map<string, { stepId: string; cue: RecipeTimerCue }>,
): CookTimerState[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const timers: CookTimerState[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return null;
    const authored = authoredTimers.get(candidate.id);
    if (
      authored === undefined ||
      seen.has(candidate.id) ||
      candidate.stepId !== authored.stepId ||
      candidate.cueId !== authored.cue.id ||
      typeof candidate.remainingSeconds !== "number" ||
      !Number.isInteger(candidate.remainingSeconds) ||
      candidate.remainingSeconds < 0 ||
      candidate.remainingSeconds > authored.cue.durationSeconds ||
      (candidate.startedAt !== null &&
        (typeof candidate.startedAt !== "number" ||
          !Number.isFinite(candidate.startedAt)))
    ) {
      return null;
    }
    seen.add(candidate.id);
    timers.push({
      id: candidate.id,
      stepId: authored.stepId,
      cueId: authored.cue.id,
      label: authored.cue.label,
      durationSeconds: authored.cue.durationSeconds,
      remainingSeconds: candidate.remainingSeconds,
      startedAt: candidate.startedAt,
    });
  }
  return timers;
}

function isStepIndex(value: unknown, stepCount: number): value is number {
  return (
    Number.isInteger(value) && Number(value) >= 0 && Number(value) < stepCount
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
