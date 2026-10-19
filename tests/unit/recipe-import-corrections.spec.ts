import { expect, test } from "@playwright/test";
import { applyRecipeCorrections } from "../../convex/lib/recipeImport/corrections";
import {
  correctionOutputSchema,
  importedRecipeSchema,
  type RecipeImportModelClient,
  createGatewayRecipeImportModelClient,
  importOutputSchema,
} from "../../convex/lib/recipeImport/models";
import { generateText } from "ai";
import { organiseCandidate } from "../../convex/lib/recipeImport/extraction";
import { extractTextCandidate } from "../../convex/lib/recipeImport/source";

const recipe = importedRecipeSchema.parse({
  title: "Soup",
  titleSourceIds: [],
  description: null,
  servings: null,
  prepMinutes: null,
  cookMinutes: { value: 21, origin: "estimated", sourceIds: [] },
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
      group: "Soup",
      noteRefs: [],
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [
    {
      sourceIds: [],
      text: "Simmer for 20 minutes.",
      group: "Soup",
      noteRefs: [],
    },
  ],
  notes: [],
});

test("all roles retain the quality-tested reasoning setting and disable provider retries", async () => {
  const options: Parameters<typeof generateText>[0][] = [];
  const run = (async (input: Parameters<typeof generateText>[0]) => {
    options.push(input);
    return {
      output:
        options.length === 2
          ? { sourceStatus: "recipe", changes: [], issues: [] }
          : { result: { status: "no_recipe" } },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        outputTokenDetails: { reasoningTokens: 0 },
      },
      response: { modelId: "openai/gpt-5.4" },
    } as Awaited<ReturnType<typeof generateText>>;
  }) as typeof generateText;
  const client = createGatewayRecipeImportModelClient(undefined, run);
  for (const role of ["normalize", "correct", "recover"])
    await client.generate<unknown>({
      role,
      primaryModel: "openai/gpt-5.4",
      schema: role === "correct" ? correctionOutputSchema : importOutputSchema,
      system: "test",
      prompt: "test",
    });
  expect(
    options.map((option) => option.providerOptions?.openai?.reasoningEffort),
  ).toEqual(["low", "low", "low"]);
  expect(options.every((option) => option.maxRetries === 0)).toBe(true);
});

test("empty corrections preserve typed amounts, estimates and provenance exactly", () => {
  const result = applyRecipeCorrections(recipe, { changes: [], issues: [] });
  expect(result).toEqual(recipe);
  expect(recipe.ingredients[0].amount).toMatchObject({ value: 2 });
});

test("section corrections preserve repeated groups, purchase amounts and note relationships", () => {
  const ingredients = [
    ...recipe.ingredients,
    {
      ...recipe.ingredients[0],
      name: "tomatoes",
      group: "Sauce",
      amount: {
        kind: "package" as const,
        count: 2,
        unit: "can" as const,
        size: { value: 400, unit: "g" as const },
        equivalents: [],
      },
      noteRefs: ["note-1"],
    },
    { ...recipe.ingredients[0], group: "Sauce" },
  ];
  const correction = correctionOutputSchema.parse({
    sourceStatus: "recipe",
    changes: [
      {
        field: "ingredients",
        value: [{ start: 1, remove: 0, items: ingredients.slice(1) }],
      },
      {
        field: "notes",
        value: [
          {
            start: 0,
            remove: 0,
            items: [
              {
                id: "note-1",
                sourceIds: [],
                label: null,
                text: "Drain tomatoes.",
              },
            ],
          },
        ],
      },
      {
        field: "steps",
        value: [
          {
            start: 1,
            remove: 0,
            items: [
              {
                ...recipe.steps[0],
                text: "Add tomatoes and simmer.",
                noteRefs: ["note-1"],
              },
            ],
          },
        ],
      },
    ],
    issues: [],
  });
  const result = applyRecipeCorrections(recipe, correction);
  expect(result.ingredients).toEqual(ingredients);
  expect(result.steps[1].noteRefs).toEqual(["note-1"]);
  expect(result.cookMinutes).toEqual(recipe.cookMinutes);
});

test("explicit null clears metadata and duplicate section changes are rejected", () => {
  expect(
    applyRecipeCorrections(recipe, {
      changes: [{ field: "cookMinutes", value: null }],
      issues: [],
    }).cookMinutes,
  ).toBeNull();
  expect(() =>
    applyRecipeCorrections(recipe, {
      changes: [
        { field: "title", value: "A" },
        { field: "title", value: "B" },
      ],
      issues: [],
    }),
  ).toThrow("Duplicate correction field");
  expect(() =>
    correctionOutputSchema.parse({
      changes: [{ field: "unknown", value: [] }],
      issues: [],
    }),
  ).toThrow();
});

test("row edits target original positions and reject ambiguity or overflow", () => {
  const original = {
    ...recipe,
    steps: [
      { ...recipe.steps[0], text: "First" },
      { ...recipe.steps[0], text: "Second" },
      { ...recipe.steps[0], text: "Third" },
    ],
  };
  const result = applyRecipeCorrections(original, {
    changes: [
      {
        field: "steps",
        value: [
          { start: 0, remove: 1, items: [] },
          {
            start: 2,
            remove: 1,
            items: [{ ...recipe.steps[0], text: "Corrected third" }],
          },
          {
            start: 3,
            remove: 0,
            items: [{ ...recipe.steps[0], text: "Fourth" }],
          },
        ],
      },
    ],
    issues: [],
  });
  expect(result.steps.map((row) => row.text)).toEqual([
    "Second",
    "Corrected third",
    "Fourth",
  ]);
  expect(original.steps[0].text).toBe("First");
  for (const edits of [
    [{ start: -1, remove: 0, items: [] }],
    [{ start: 0.5, remove: 0, items: [] }],
    [{ start: 0, remove: -1, items: [] }],
    [{ start: 4, remove: 0, items: [] }],
    [{ start: 2, remove: 2, items: [] }],
    [
      { start: 0, remove: 2, items: [] },
      { start: 1, remove: 0, items: [] },
    ],
    [
      { start: 0, remove: 0, items: [] },
      { start: 0, remove: 0, items: [] },
    ],
  ])
    expect(() =>
      applyRecipeCorrections(original, {
        changes: [{ field: "steps", value: edits }],
        issues: [],
      }),
    ).toThrow("row corrections");
  expect(() =>
    applyRecipeCorrections(recipe, {
      changes: [
        {
          field: "steps",
          value: [
            {
              start: 1,
              remove: 0,
              items: Array.from({ length: 100 }, () => recipe.steps[0]),
            },
          ],
        },
      ],
      issues: [],
    }),
  ).toThrow();
});

test("malformed corrections use one complete recovery, never additional correction loops", async () => {
  const roles: string[] = [];
  const client: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      if (task.role === "recover") {
        expect(task.prompt).toContain("duplicate_field");
        expect(task.prompt).toContain("changes.title");
      }
      return task.schema.parse(
        task.role === "correct"
          ? {
              sourceStatus: "recipe",
              changes: [
                { field: "title", value: "A" },
                { field: "title", value: "B" },
              ],
              issues: [],
            }
          : { result: { status: "recipe", recipe, issues: [] } },
      );
    },
  };
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots\nSimmer for 20 minutes."),
    client,
  );
  expect(result.status).toBe("usable");
  expect(roles).toEqual(["normalize", "correct", "recover"]);
});

test("the focused checker can identify a normalization false positive as a non-recipe", async () => {
  const roles: string[] = [];
  await expect(
    organiseCandidate(extractTextCandidate("Welcome to our newsletter."), {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "correct"
            ? { sourceStatus: "no_recipe", changes: [], issues: [] }
            : { result: { status: "recipe", recipe, issues: [] } },
        );
      },
    }),
  ).rejects.toMatchObject({ code: "no_recipe" });
  expect(roles).toEqual(["normalize", "correct"]);
});

test("recoverable quantity conflicts still receive one bounded complete recovery", async () => {
  const roles: string[] = [];
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots\nSimmer 20 minutes."),
    {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "correct"
            ? {
                sourceStatus: "recipe",
                changes: [],
                issues: [
                  {
                    area: "ingredients",
                    code: "source_conflict",
                    targetId: "ingredient-1",
                    message: "Resolve the conflicting ingredient amounts.",
                    blocking: true,
                  },
                ],
              }
            : { result: { status: "recipe", recipe, issues: [] } },
        );
      },
    },
  );
  expect(result.status).toBe("usable");
  expect(roles).toEqual(["normalize", "correct", "recover"]);
});

test("missing optional metadata can be filled without regenerating ingredients or changing amounts", async () => {
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots, chopped\nSimmer 20 minutes."),
    {
      generate: async (task) =>
        task.schema.parse(
          task.role === "correct"
            ? {
                sourceStatus: "recipe",
                changes: [
                  {
                    field: "prepMinutes",
                    value: { value: 5, origin: "estimated", sourceIds: [] },
                  },
                ],
                issues: [],
              }
            : { result: { status: "recipe", recipe, issues: [] } },
        ),
    },
  );
  expect(result.recipe.prepMinutes).toBe(5);
  expect(result.recipe.ingredients[0].amountText).toBe("2");
  expect(result.recipe.cookMinutes).toBe(21);
  expect(result.metadataProvenance.prepMinutes).toBe("estimated");
});
