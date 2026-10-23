import { z } from "zod";
import { RECIPE_LIMITS, type RecipeStep } from "../../src/lib/domain/recipes";

/** Repair AI identifier collisions without changing any timer's meaning. */
export function uniqueGeneratedTimerIds<T extends RecipeStep>(
  steps: T[],
  previousSteps: readonly RecipeStep[] = [],
): T[] {
  type Position = {
    stepIndex: number;
    cueIndex: number;
    stepId: string;
    label: string;
  };
  const occurrences = new Map<string, Position[]>();
  steps.forEach((step, stepIndex) => {
    step.timerCues?.forEach((cue, cueIndex) => {
      const positions = occurrences.get(cue.id) ?? [];
      positions.push({
        stepIndex,
        cueIndex,
        stepId: step.id,
        label: cue.label,
      });
      occurrences.set(cue.id, positions);
    });
  });
  const previousOwners = new Map(
    previousSteps.flatMap((step) =>
      (step.timerCues ?? []).map(
        (cue) => [cue.id, { stepId: step.id, label: cue.label }] as const,
      ),
    ),
  );
  const owners = new Map(
    [...occurrences].map(([id, positions]) => {
      const previous = previousOwners.get(id);
      const owner =
        positions.find(
          (position) =>
            position.stepId === previous?.stepId &&
            position.label === previous.label,
        ) ??
        positions.find((position) => position.stepId === previous?.stepId) ??
        positions[0];
      return [id, owner] as const;
    }),
  );
  // Reserve ALL supplied IDs, including IDs that occur later in the recipe.
  const used = new Set(occurrences.keys());
  return steps.map((step, stepIndex) => ({
    ...step,
    ...(step.timerCues === undefined
      ? {}
      : {
          timerCues: step.timerCues.map((cue, cueIndex) => {
            const owner = owners.get(cue.id)!;
            if (owner.stepIndex === stepIndex && owner.cueIndex === cueIndex)
              return cue;
            let number = 2;
            let id: string;
            do {
              const suffix = `-${number++}`;
              id =
                cue.id.slice(0, RECIPE_LIMITS.timerCueId - suffix.length) +
                suffix;
            } while (used.has(id));
            used.add(id);
            return { ...cue, id };
          }),
        }),
  }));
}

/** The same authored content contract feeds every Cook surface. */
export const timerCuesSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(RECIPE_LIMITS.timerCueId),
      label: z.string().trim().min(1).max(RECIPE_LIMITS.timerCueLabel),
      durationSeconds: z
        .number()
        .int()
        .min(1)
        .max(RECIPE_LIMITS.timerDurationSeconds),
    }),
  )
  .max(RECIPE_LIMITS.steps);

export const TIMER_AUTHORING_POLICY = `Cook timers are explicit step metadata, not inferred by the app at runtime. Return timerCues on every step (an empty array when no timer applies). For every explicit actionable timed phase in the selected method or its directly referenced recipe notes, add a concise, descriptive label and durationSeconds. Include timed preparation, cooking, resting, marinating and chilling; use separate cues for distinct phases. Use recipe-wide unique stable cue IDs; preserve IDs when the purpose is retained, updating durations when the instruction changes. For ranges such as 10–15 minutes use the lower bound (600 seconds) and a check label. Preserve the full range, qualifiers and doneness/safety checks in the instruction. For per-side or per-batch timings, label the cue accordingly and use the duration for ONE side/batch, not the total. Never invent a duration from summary prep/cook times, unrelated commentary or an untimed instruction such as until golden. Do not convert temperature probe hold times into cooking-completion timers. Only represent positive durations up to 24 hours; retain longer or indeterminate waits in prose. Timers prompt the next check; they never establish doneness or replace safety checks.`;

export const TIMER_REVIEW_POLICY = `Audit every explicit actionable timed phase against timerCues, including directly referenced method notes. Correct missing cues, wrong durations, lost per-side/per-batch qualifiers, duplicate IDs and stale cues after method changes. Range timers use the earliest check time and retain the full range in prose. Never require invented timings for untimed instructions.`;
