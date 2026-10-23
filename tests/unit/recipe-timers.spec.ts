import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { timerCuesSchema } from "../../convex/lib/recipeTimers";
import { importedRecipeSchema } from "../../convex/lib/recipeImport/models";
import { organiseCandidate } from "../../convex/lib/recipeImport/extraction";
import {
  extractHtmlCandidate,
  extractTextCandidate,
} from "../../convex/lib/recipeImport/source";
import { prepareRecipeContent } from "../../src/lib/domain/recipes";
import { score } from "../../scripts/evaluate-recipe-import";
import {
  cookTimerId,
  emptyCookSession,
  reduceCookSession,
  remainingTimerSeconds,
  restoreCookSession,
} from "../../src/lib/domain/cook-session";

const cues = [
  { id: "simmer", label: "Check simmer", durationSeconds: 600 },
  { id: "rest", label: "Rest", durationSeconds: 30 },
];
const imported = importedRecipeSchema.parse({
  title: "Carrot soup",
  titleSourceIds: [],
  description: null,
  servings: null,
  prepMinutes: null,
  cookMinutes: null,
  proteinCategory: "meat-free",
  ingredients: [
    {
      sourceIds: [],
      name: "carrots",
      amount: {
        kind: "exact",
        value: 2,
        unit: null,
        qualifier: null,
        equivalents: [],
      },
      note: null,
      group: null,
      noteRefs: [],
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [
    {
      sourceIds: [],
      text: "Simmer for 10–15 minutes, then rest for 30 seconds.",
      group: null,
      noteRefs: [],
      timerCues: cues,
    },
  ],
  notes: [],
});

for (const seconds of [0, -1, 0.5, 86401]) {
  test(`rejects invalid timer duration ${seconds}`, () => {
    expect(
      timerCuesSchema.safeParse([{ ...cues[0], durationSeconds: seconds }])
        .success,
    ).toBe(false);
  });
}
test("timer metadata is required for AI steps but optional for historical content", () => {
  const step = { ...imported.steps[0] };
  Reflect.deleteProperty(step, "timerCues");
  expect(
    importedRecipeSchema.safeParse({ ...imported, steps: [step] }).success,
  ).toBe(false);
  expect(
    timerCuesSchema.parse([{ ...cues[0], durationSeconds: 86400 }])[0]
      .durationSeconds,
  ).toBe(86400);
  expect(
    prepareRecipeContent({
      title: "Soup",
      proteinCategory: "meat-free",
      ingredients: [
        { id: "carrots", name: "carrots", shoppingCategory: "fruit_and_veg" },
      ],
      steps: [{ id: "simmer", text: "Simmer." }],
    }).steps[0].timerCues,
  ).toBeUndefined();
});

for (const kind of ["text", "html"] as const) {
  test(`${kind} import corrections add cues and feed recoverable Cook timers`, async () => {
    const source =
      kind === "text"
        ? extractTextCandidate(
            "Carrot soup\n2 carrots\nSimmer for 10–15 minutes, then rest for 30 seconds.",
          )
        : extractHtmlCandidate(
            "<h1>Carrot soup</h1><h2>Ingredients</h2><p>2 carrots</p><h2>Method</h2><p>Simmer for 10–15 minutes, then rest for 30 seconds.</p>",
            "https://example.com/soup",
          );
    const roles: string[] = [];
    const result = await organiseCandidate(source, {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "correct"
            ? {
                sourceStatus: "recipe",
                changes: [
                  {
                    field: "steps",
                    value: [{ start: 0, remove: 1, items: imported.steps }],
                  },
                ],
                issues: [],
              }
            : {
                result: {
                  status: "recipe",
                  recipe: {
                    ...imported,
                    steps: [{ ...imported.steps[0], timerCues: [] }],
                  },
                  issues: [],
                },
              },
        );
      },
    });
    expect(roles).toEqual(["normalize", "correct"]);
    expect(result.status).toBe("usable");
    expect(result.recipe.steps[0].timerCues).toEqual(cues);
    const meal = {
      ...result.recipe,
      id: kind,
      slug: kind,
      version: 1,
      position: 0,
    };
    const context = { meal, catalogueVersion: 1, servings: 2 };
    const step = meal.steps[0];
    const cue = step.timerCues![0];
    const timerId = cookTimerId(step.id, cue.id);
    let session = reduceCookSession(emptyCookSession(context), {
      type: "start-timer",
      stepId: step.id,
      cue,
      now: 1000,
    });
    session = reduceCookSession(session, { type: "show-ingredients" });
    session = restoreCookSession(JSON.parse(JSON.stringify(session)), context);
    expect(remainingTimerSeconds(session.timers[0], 11000)).toBe(590);
    session = reduceCookSession(session, {
      type: "toggle-timer",
      timerId,
      now: 11000,
    });
    expect(remainingTimerSeconds(session.timers[0], 21000)).toBe(590);
    session = reduceCookSession(session, {
      type: "restart-timer",
      timerId,
      now: 21000,
    });
    expect(remainingTimerSeconds(session.timers[0], 21000)).toBe(600);
  });
}

test("recovery retains timer metadata on an incomplete import draft", async () => {
  const roles: string[] = [];
  const result = await organiseCandidate(
    extractTextCandidate(
      "Soup\nSimmer for 10–15 minutes, then rest for 30 seconds.",
    ),
    {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "correct"
            ? { sourceStatus: "recipe", changes: [], issues: [] }
            : {
                result: {
                  status: "recipe",
                  recipe: {
                    ...imported,
                    ingredients: [],
                    steps:
                      task.role === "recover"
                        ? imported.steps
                        : [
                            {
                              ...imported.steps[0],
                              timerCues: [cues[0], cues[0]],
                            },
                          ],
                  },
                  issues: [],
                },
              },
        );
      },
    },
  );
  expect(roles).toEqual(["normalize", "correct", "recover"]);
  expect(result.status).toBe("draft");
  expect(result.recipe.steps[0].timerCues).toEqual(cues);
});

test("independent evaluation rejects missing, misplaced and incorrect timers", () => {
  const recipe = prepareRecipeContent({
    title: "Soup",
    proteinCategory: "meat-free",
    ingredients: [
      { id: "carrot", name: "carrot", shoppingCategory: "fruit_and_veg" },
    ],
    steps: [
      { id: "soup", text: "Simmer for 10–15 minutes.", timerCues: [cues[0]] },
    ],
  });
  const item = {
    id: "timers",
    kind: "text" as const,
    expect: "succeeded" as const,
    expectedTimers: [
      { stepPattern: "simmer", labelPattern: "simmer", durationSeconds: 600 },
    ],
  };
  expect(score(recipe, item, {}).timerCoverage).toBe(true);
  expect(
    score(
      { ...recipe, steps: [{ ...recipe.steps[0], timerCues: [] }] },
      item,
      {},
    ).timerCoverage,
  ).toBe(false);
  expect(
    score(
      recipe,
      {
        ...item,
        expectedTimers: [{ ...item.expectedTimers[0], durationSeconds: 900 }],
      },
      {},
    ).timerCoverage,
  ).toBe(false);
  expect(
    score(
      recipe,
      {
        ...item,
        expectedTimers: [{ ...item.expectedTimers[0], stepPattern: "bake" }],
      },
      {},
    ).timerCoverage,
  ).toBe(false);
  expect(
    score(recipe, { ...item, expectedNoTimers: true }, {}).timerCoverage,
  ).toBe(false);
});

test("timer corpus includes readable-only and structured-only instructions", () => {
  for (const fixture of ["timers-readable.html", "timers-structured.html"]) {
    const source = extractHtmlCandidate(
      readFileSync(`tests/fixtures/${fixture}`, "utf8"),
      "https://example.com/timers",
    );
    expect(source.sourceText).toContain("30 seconds");
    expect(source.sourceText).toContain("10–15 minutes");
    expect(source.sourceText).toContain("per side");
  }
});
