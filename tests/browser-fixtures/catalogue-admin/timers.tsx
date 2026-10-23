import { useReducer, useState } from "react";
import {
  StepScreen,
  IngredientsScreen,
} from "../../../src/features/cook/cook-mode-screens";
import { RecipeTimerEditor } from "../../../src/features/recipes/recipe-timer-editor";
import {
  emptyCookSession,
  reduceCookSession,
} from "../../../src/lib/domain/cook-session";
import { scaleIngredients } from "../../../src/lib/domain/ingredient-scaling";
import type { CatalogueMeal } from "../../../src/lib/domain/recipes";

export function TimersFixture() {
  const [meal, setMeal] = useState<CatalogueMeal>({
    id: "timers",
    slug: "timers",
    version: 1,
    position: 0,
    title: "Timer test recipe",
    proteinCategory: "meat-free",
    servings: 2,
    ingredients: [{ id: "tofu", name: "tofu", shoppingCategory: "pantry" }],
    steps: [
      {
        id: "fry",
        text: "Fry for 30 seconds per side, then rest for 2 minutes.",
        timerCues: [
          { id: "side", label: "Fry per side", durationSeconds: 30 },
          { id: "rest", label: "Rest", durationSeconds: 120 },
        ],
      },
      { id: "serve", text: "Serve." },
    ],
  });
  const [editing, setEditing] = useState(true);
  const [now, setNow] = useState(1000);
  const [menu, setMenu] = useState<string | null>(null);
  const [session, dispatch] = useReducer(
    reduceCookSession,
    { meal, catalogueVersion: 1, servings: 2 },
    emptyCookSession,
  );
  const actions = {
    now,
    timerMenuId: menu,
    onTimerToggle: (timerId: string) =>
      dispatch({ type: "toggle-timer", timerId, now }),
    onTimerMenuToggle: (timerId: string) => setMenu(timerId),
    onTimerMenuClose: () => setMenu(null),
    onTimerCancel: (timerId: string) =>
      dispatch({ type: "cancel-timer", timerId }),
    onTimerRestart: (timerId: string) =>
      dispatch({ type: "restart-timer", timerId, now }),
  };
  if (editing)
    return (
      <main>
        <RecipeTimerEditor
          stepNumber={1}
          cues={meal.steps[0].timerCues}
          onChange={(timerCues) =>
            setMeal({
              ...meal,
              steps: meal.steps.map((step, index) =>
                index === 0 ? { ...step, timerCues } : step,
              ),
            })
          }
        />
        <button
          onClick={() => {
            setEditing(false);
            dispatch({ type: "start-cooking" });
          }}
        >
          Cook recipe
        </button>
      </main>
    );
  return (
    <>
      <button onClick={() => setNow(now + 10000)}>Advance ten seconds</button>
      {session.phase.name === "ingredients" ? (
        <IngredientsScreen
          meal={meal}
          session={session}
          persistenceAvailable
          ingredients={scaleIngredients(meal.ingredients, meal.servings, 2)}
          onBack={() => dispatch({ type: "hide-ingredients" })}
          {...actions}
        />
      ) : session.phase.name === "step" ? (
        <StepScreen
          meal={meal}
          session={{ ...session, phase: session.phase }}
          persistenceAvailable
          onExit={() => setEditing(true)}
          onIngredients={() => dispatch({ type: "show-ingredients" })}
          onPrevious={() => dispatch({ type: "previous-step" })}
          onNext={() =>
            dispatch({ type: "next-step", stepCount: meal.steps.length })
          }
          onStartTimer={(stepId, cue) =>
            dispatch({ type: "start-timer", stepId, cue, now })
          }
          {...actions}
        />
      ) : null}
    </>
  );
}
