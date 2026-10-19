import { expect, test } from "@playwright/test";
import { z } from "zod";
import {
  generateText,
  NoObjectGeneratedError,
  type LanguageModelUsage,
} from "ai";
import {
  extractHtmlCandidate,
  extractTextCandidate,
  serializeRecipeEvidence,
} from "../../convex/lib/recipeImport/source";
import { organiseCandidate } from "../../convex/lib/recipeImport/extraction";
import { formatImportAmount } from "../../convex/lib/recipeImport/measurements";
import {
  createGatewayRecipeImportModelClient,
  importedRecipeSchema,
  type RecipeImportModelTelemetry,
} from "../../convex/lib/recipeImport/models";
import {
  draftRecipeText,
  preserveDraftMetadataProvenance,
} from "../../src/lib/domain/recipe-import-draft";
import {
  measurementSignature,
  score,
  type CorpusItem,
} from "../../scripts/evaluate-recipe-import";
import type { RecipeContent } from "../../src/lib/domain/recipes";

const normalized = importedRecipeSchema.parse({
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
      text: "Simmer for 20 minutes.",
      group: null,
      noteRefs: [],
    },
  ],
  notes: [],
});
const content: RecipeContent = {
  title: "Soup",
  proteinCategory: "meat-free",
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 20,
  ingredients: [
    {
      id: "ingredient-1",
      name: "carrots",
      amountText: "2",
      shoppingCategory: "fruit_and_veg",
    },
    {
      id: "ingredient-2",
      name: "stock",
      amountText: "500 ml",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    {
      id: "step-1",
      text: "Peel for 5 minutes, simmer for 20 minutes, then blend.",
    },
  ],
};

test("long articles cannot crowd out structured or unmarked readable recipe sections", () => {
  const story = Array.from(
    { length: 250 },
    (_, i) => `<p>Story ${i} ${"background words ".repeat(24)}</p>`,
  ).join("");
  const visible =
    "<h2>Ingredients</h2><h3>Soup</h3><p>2 carrots</p><p>500 ml stock</p><h2>Method</h2><p>Simmer carrots in stock for 20 minutes.</p>";
  const structured = `<script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Carrot soup", recipeIngredient: ["2 carrots", "500 ml stock"], recipeInstructions: ["Simmer carrots in stock for 20 minutes."] })}</script>`;
  for (const recipe of [visible, structured]) {
    const source = extractHtmlCandidate(
      `<article><h1>Carrot soup</h1>${story}${recipe}</article>`,
      "https://example.com/soup",
    );
    expect(source.truncated).toBe(true);
    expect(source.sourceText).toContain("500 ml stock");
    expect(source.sourceText).toContain("Simmer carrots in stock");
    expect(serializeRecipeEvidence(source).length).toBeLessThanOrEqual(60_000);
    expect(serializeRecipeEvidence(source)).not.toContain('"priority"');
  }
});

test("priority selection preserves complete small-source order and repeated component rows", () => {
  const source = extractHtmlCandidate(
    "<article><h1>Soup</h1><p>Introduction.</p><h2>Ingredients</h2><h3>Main</h3><p>1 tbsp oil</p><h3>Dressing</h3><p>1 tbsp oil</p><h2>Method</h2><p>Mix.</p></article>",
    "https://example.com/soup",
  );
  expect(source.truncated).toBe(false);
  expect(source.blocks.map((b) => b.text)).toEqual([
    "Soup",
    "Soup",
    "Introduction.",
    "Ingredients",
    "Main",
    "1 tbsp oil",
    "Dressing",
    "1 tbsp oil",
    "Method",
    "Mix.",
  ]);
  expect(source.blocks.map((b) => b.id)).toEqual(
    source.blocks.map((_, i) => `B${i + 1}`),
  );
});

test("missing essential method references recover once, then retain an actionable draft", async () => {
  const recipe = {
    ...normalized,
    steps: [
      {
        ...normalized.steps[0],
        text: "Cook according to note 1.",
        noteRefs: ["note-1"],
      },
    ],
  };
  const roles: string[] = [];
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots\nCook according to note 1."),
    {
      generate: async (task) => {
        roles.push(task.role);
        if (task.role === "recover")
          expect(task.prompt).toContain("Restore the missing guidance");
        return task.schema.parse(
          task.role === "correct"
            ? { sourceStatus: "recipe", changes: [], issues: [] }
            : { result: { status: "recipe", recipe, issues: [] } },
        );
      },
    },
  );
  expect(roles).toEqual(["normalize", "correct", "recover"]);
  expect(result.status).toBe("draft");
  expect(result.issues).toContainEqual(
    expect.objectContaining({
      area: "method",
      targetId: "step-1",
      blocking: true,
    }),
  );
});

test("bounded recovery restores referenced cooking instructions without a fourth call", async () => {
  const recipe = {
    ...normalized,
    steps: [{ ...normalized.steps[0], noteRefs: ["note-1"] }],
  };
  let calls = 0;
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots\nNote 1: simmer for 20 minutes."),
    {
      generate: async (task) => {
        calls++;
        return task.schema.parse(
          task.role === "correct"
            ? { sourceStatus: "recipe", changes: [], issues: [] }
            : {
                result: {
                  status: "recipe",
                  recipe:
                    task.role === "recover"
                      ? {
                          ...recipe,
                          notes: [
                            {
                              id: "note-1",
                              sourceIds: [],
                              label: null,
                              text: "Simmer for 20 minutes.",
                            },
                          ],
                        }
                      : recipe,
                  issues: [],
                },
              },
        );
      },
    },
  );
  expect(calls).toBe(3);
  expect(result.status).toBe("usable");
  expect(result.recipe.steps[0].noteRefs).toEqual(["note-1"]);
});

test("explicitly checked nonessential method references remain nonblocking in two calls", async () => {
  const recipe = {
    ...normalized,
    steps: [{ ...normalized.steps[0], noteRefs: ["note-1"] }],
  };
  let calls = 0;
  const result = await organiseCandidate(
    extractTextCandidate("Soup\n2 carrots\nSimmer for 20 minutes."),
    {
      generate: async (task) => {
        calls++;
        return task.schema.parse(
          task.role === "correct"
            ? {
                sourceStatus: "recipe",
                changes: [],
                issues: [
                  {
                    area: "method",
                    code: "unresolved_reference",
                    targetId: "step-1",
                    message:
                      "The missing note is only a serving suggestion; the cooking instructions are complete.",
                    blocking: false,
                  },
                ],
              }
            : { result: { status: "recipe", recipe, issues: [] } },
        );
      },
    },
  );
  expect(calls).toBe(2);
  expect(result.status).toBe("usable");
  expect(result.recipe.steps[0].noteRefs).toEqual([]);
});

test("published metric equivalents keep qualifiers attached to their original measurement", () => {
  for (const [unit, qualifier, grams] of [
    ["cup", "packed", 200],
    ["tbsp", "heaped", 20],
  ] as const) {
    expect(
      formatImportAmount({
        kind: "exact",
        value: 1,
        unit,
        qualifier,
        equivalents: [{ value: grams, unit: "g" }],
      }),
    ).toEqual({
      quantity: String(grams),
      unit: "g",
      amountText: `${grams} g (1 ${qualifier} ${unit})`,
    });
  }
  expect(
    formatImportAmount({
      kind: "exact",
      value: 1,
      unit: "cup",
      qualifier: "packed",
      equivalents: [],
    }).amountText,
  ).toBe("1 packed cup");
});

test("resume preserves metadata provenance and explicit note relationships", () => {
  const recipe = {
    ...content,
    steps: [{ ...content.steps[0], noteRefs: ["note-1"] }],
    notes: [{ id: "note-1", label: "Safety", text: "Do not boil dry." }],
  };
  const text = draftRecipeText(recipe, {
    prepMinutes: "estimated",
    cookMinutes: "derived",
  });
  expect(text).toContain("previous draft: estimated");
  expect(text).toContain("[see note-1]");
  expect(text).toContain("note-1 (Safety): Do not boil dry.");
  expect(
    preserveDraftMetadataProvenance(
      content,
      { prepMinutes: "estimated", cookMinutes: "derived" },
      content,
      {
        servings: "published",
        prepMinutes: "published",
        cookMinutes: "published",
      },
    ),
  ).toEqual({ prepMinutes: "estimated", cookMinutes: "derived" });
  expect(
    preserveDraftMetadataProvenance(
      content,
      {},
      { ...content, cookMinutes: 25 },
      { prepMinutes: "published", cookMinutes: "derived" },
    ),
  ).toEqual({ cookMinutes: "derived" });
});

test("measurement gates reject numeric substrings, missing principal ingredients and wrong packages", () => {
  const item: CorpusItem = {
    id: "soup",
    kind: "text",
    expect: "succeeded",
    expectedIngredientPatterns: [
      { name: "carrots", amount: "^2$" },
      { name: "stock", amount: "500 ml" },
    ],
    expectedMethodPatterns: ["20 min", "blend"],
  };
  expect(score(content, item, {}).measurementAccuracy).toBe(true);
  for (const amountText of [
    "1500 ml",
    "5000 ml",
    "500 g",
    "2 × 500 ml bottles",
  ])
    expect(
      score(
        {
          ...content,
          ingredients: [
            content.ingredients[0],
            { ...content.ingredients[1], amountText },
          ],
        },
        item,
        {},
      ).measurementAccuracy,
    ).toBe(false);
  expect(
    score({ ...content, ingredients: [content.ingredients[1]] }, item, {})
      .semanticPreservation,
  ).toBe(false);
  const packageItem: CorpusItem = {
    ...item,
    expectedIngredientPatterns: [
      {
        name: "stock",
        measurement: {
          kind: "package",
          count: 2,
          unit: "can",
          size: { value: 400, unit: "g" },
          equivalents: [],
        },
      },
    ],
  };
  expect(
    score(
      {
        ...content,
        ingredients: [
          { ...content.ingredients[1], amountText: "1 × 400 g can" },
        ],
      },
      packageItem,
      {},
    ).measurementAccuracy,
  ).toBe(false);
  expect(
    score(
      {
        ...content,
        ingredients: [
          { ...content.ingredients[1], amountText: "2 × 400 g cans" },
        ],
      },
      packageItem,
      {},
    ).measurementAccuracy,
  ).toBe(true);
});

test("repeatability ignores prose but detects amount, category and component changes", () => {
  const item: CorpusItem = {
    id: "soup",
    kind: "text",
    expect: "succeeded",
    expectedIngredientPatterns: [
      { name: "carrot", group: "Main" },
      { name: "stock", group: "Main" },
    ],
  };
  const signature = measurementSignature(content, item);
  expect(
    measurementSignature(
      { ...content, title: "A better soup", cookMinutes: 21 },
      item,
    ),
  ).toBe(signature);
  expect(
    measurementSignature(
      {
        ...content,
        ingredients: [
          { ...content.ingredients[0], group: "Main" },
          { ...content.ingredients[1], group: "Sauce" },
        ],
      },
      item,
    ),
  ).not.toBe(signature);
  expect(
    measurementSignature(
      {
        ...content,
        ingredients: [
          content.ingredients[0],
          { ...content.ingredients[1], amountText: "1500 ml" },
        ],
      },
      item,
    ),
  ).not.toBe(signature);
});

test("count noun placement is equivalent only when both identity and count survive", () => {
  const item: CorpusItem = {
    id: "garlic",
    kind: "text",
    expect: "succeeded",
    expectedIngredientPatterns: [
      {
        name: "garlic",
        measurement: {
          kind: "exact",
          value: 1,
          unit: "clove",
          qualifier: null,
          equivalents: [],
        },
      },
    ],
    expectedMethodPatterns: ["simmer"],
  };
  const withGarlic = (name: string, amountText: string): RecipeContent => ({
    ...content,
    ingredients: [
      {
        ...content.ingredients[0],
        name,
        amountText,
        shoppingCategory: "fruit_and_veg",
      },
    ],
  });
  const canonical = withGarlic("garlic", "1 clove");
  const identityCount = withGarlic("small garlic clove", "1");
  expect(score(identityCount, item, {}).measurementAccuracy).toBe(true);
  expect(measurementSignature(identityCount, item)).toBe(
    measurementSignature(canonical, item),
  );
  for (const [name, amount] of [
    ["small garlic clove", "2"],
    ["garlic", "1"],
    ["garlic", "1 head"],
  ])
    expect(score(withGarlic(name, amount), item, {}).measurementAccuracy).toBe(
      false,
    );
});

test("container synonyms do not hide changed package counts or sizes", () => {
  const item: CorpusItem = {
    id: "packages",
    kind: "text",
    expect: "succeeded",
    expectedIngredientPatterns: [
      {
        name: "stock",
        measurement: {
          kind: "package",
          count: 2,
          unit: "pack",
          size: { value: 400, unit: "g" },
          equivalents: [],
        },
      },
    ],
    expectedMethodPatterns: ["simmer"],
  };
  const recipe = (amountText: string): RecipeContent => ({
    ...content,
    ingredients: [{ ...content.ingredients[1], amountText }],
  });
  expect(score(recipe("2 × 400 g packets"), item, {}).measurementAccuracy).toBe(
    true,
  );
  expect(measurementSignature(recipe("2 × 400 g packets"), item)).toBe(
    measurementSignature(recipe("2 × 400 g packs"), item),
  );
  for (const amount of [
    "1 × 400 g pack",
    "2 × 1400 g packs",
    "2 × 400 ml packs",
  ])
    expect(score(recipe(amount), item, {}).measurementAccuracy).toBe(false);
});

test("repeatability does not mistake optional inferred groups for lost authored components", () => {
  const item: CorpusItem = {
    id: "groups",
    kind: "text",
    expect: "succeeded",
    expectedIngredientPatterns: [{ name: "carrot" }, { name: "stock" }],
  };
  expect(measurementSignature(content, item)).toBe(
    measurementSignature(
      {
        ...content,
        ingredients: content.ingredients.map((line) => ({
          ...line,
          group: line.name,
        })),
      },
      item,
    ),
  );
});

test("SDK malformed-output usage is counted without retaining raw generated text", async () => {
  const telemetry: RecipeImportModelTelemetry[] = [];
  const usage: LanguageModelUsage = {
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
    inputTokenDetails: {
      noCacheTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: { textTokens: 8, reasoningTokens: 2 },
  };
  const run = (async () => {
    throw new NoObjectGeneratedError({
      text: "private raw model response",
      response: { id: "test", modelId: "gpt-5.4", timestamp: new Date() },
      usage,
      finishReason: "stop",
    });
  }) as unknown as typeof generateText;
  const client = createGatewayRecipeImportModelClient(
    (event) => telemetry.push(event),
    run,
  );
  await expect(
    client.generate({
      role: "normalize",
      primaryModel: "openai/gpt-5.4",
      schema: z.object({ title: z.string() }),
      system: "test",
      prompt: "test",
    }),
  ).rejects.toMatchObject({ code: "invalid_model_output" });
  expect(telemetry[0]).toMatchObject({
    outcome: "invalid_model_output",
    inputTokens: 20,
    outputTokens: 10,
    reasoningTokens: 2,
    usageAvailable: true,
  });
  expect(JSON.stringify(telemetry)).not.toContain("private raw model response");
});

test("failed adapter attempts emit bounded telemetry and concrete source-free validation paths", async () => {
  const telemetry: RecipeImportModelTelemetry[] = [];
  const run = (async () => ({
    output: { title: 123 },
    usage: { inputTokens: 20, outputTokens: 5 },
    response: { modelId: "openai/gpt-5.4" },
  })) as unknown as typeof generateText;
  const client = createGatewayRecipeImportModelClient(
    (event) => telemetry.push(event),
    run,
  );
  await expect(
    client.generate({
      role: "normalize",
      primaryModel: "openai/gpt-5.4",
      schema: z.object({ title: z.string() }),
      prompt: "private source",
      system: "test",
    }),
  ).rejects.toMatchObject({
    code: "invalid_model_output",
    validationFindings: [{ path: "title", code: "invalid_type" }],
  });
  expect(telemetry).toHaveLength(1);
  expect(telemetry[0]).toMatchObject({
    outcome: "invalid_model_output",
    inputTokens: 20,
    outputTokens: 5,
    usageAvailable: true,
  });
  expect(JSON.stringify(telemetry)).not.toContain("private source");
});

test("provider failures and timeouts are counted even when token usage is unavailable", async () => {
  for (const timeout of [false, true]) {
    const telemetry: RecipeImportModelTelemetry[] = [];
    const run = (async () => {
      if (timeout) await new Promise((resolve) => setTimeout(resolve, 15));
      throw new Error("provider failure");
    }) as unknown as typeof generateText;
    const client = createGatewayRecipeImportModelClient(
      (event) => telemetry.push(event),
      run,
    );
    await expect(
      client.generate({
        role: "normalize",
        primaryModel: "openai/gpt-5.4",
        schema: z.object({ title: z.string() }),
        prompt: "test",
        system: "test",
        deadline: Date.now() + (timeout ? 5 : 1000),
      }),
    ).rejects.toMatchObject({ code: timeout ? "timed_out" : "ai_unavailable" });
    expect(telemetry[0]).toMatchObject({
      outcome: timeout ? "timed_out" : "ai_unavailable",
      usageAvailable: false,
    });
  }
});
