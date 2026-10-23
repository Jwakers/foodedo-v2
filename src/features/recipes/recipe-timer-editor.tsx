"use client";

import { Button } from "@/components/ui/button";
import { RECIPE_LIMITS, type RecipeTimerCue } from "@/lib/domain/recipes";
import { EditorField, NumberField } from "./recipe-editor-fields";

export function RecipeTimerEditor({
  stepNumber,
  cues = [],
  onChange,
}: {
  stepNumber: number;
  cues?: RecipeTimerCue[];
  onChange: (cues: RecipeTimerCue[]) => void;
}) {
  const update = (id: string, patch: Partial<RecipeTimerCue>) =>
    onChange(cues.map((cue) => (cue.id === id ? { ...cue, ...patch } : cue)));

  return (
    <fieldset className="my-3 space-y-3 border-l-2 border-border pl-3">
      <legend className="text-sm font-semibold">
        Step {stepNumber} timers
      </legend>
      {cues.map((cue, index) => (
        <div key={cue.id} className="space-y-2">
          <EditorField
            label={`Step ${stepNumber} timer ${index + 1} label`}
            value={cue.label}
            onChange={(label) => update(cue.id, { label })}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={`Step ${stepNumber} timer ${index + 1} minutes`}
              value={Math.floor(cue.durationSeconds / 60)}
              onChange={(minutes) =>
                update(cue.id, {
                  durationSeconds:
                    (minutes ?? 0) * 60 + (cue.durationSeconds % 60),
                })
              }
            />
            <NumberField
              label={`Step ${stepNumber} timer ${index + 1} seconds`}
              value={cue.durationSeconds % 60}
              onChange={(seconds) =>
                update(cue.id, {
                  durationSeconds:
                    Math.floor(cue.durationSeconds / 60) * 60 + (seconds ?? 0),
                })
              }
            />
          </div>
          {!Number.isInteger(cue.durationSeconds) ||
          cue.durationSeconds < 1 ||
          cue.durationSeconds > RECIPE_LIMITS.timerDurationSeconds ? (
            <p role="alert" className="text-sm text-graphite">
              Enter a whole duration between 1 second and 24 hours.
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(cues.filter((item) => item.id !== cue.id))}
          >
            Remove step {stepNumber} timer {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        disabled={cues.length >= RECIPE_LIMITS.steps}
        onClick={() =>
          onChange([
            ...cues,
            {
              id: crypto.randomUUID(),
              label: "Check cooking",
              durationSeconds: 60,
            },
          ])
        }
      >
        Add timer to step {stepNumber}
      </Button>
      <p className="text-12 text-graphite">
        Match the instruction. For a time range, set a timer for the first
        check.
      </p>
    </fieldset>
  );
}
