import { expect, test } from "@playwright/test";
import { parallelBenchmarkClient } from "../../scripts/recipe-import-parallel-benchmark";
import { score } from "../../scripts/evaluate-recipe-import";
import { z } from "zod";
import {
  extractHtmlCandidate,
  extractTextCandidate,
  organiseCandidate,
} from "../../convex/lib/recipeImport/pipeline";
import {
  serializeRecipeEvidence,
  type RecipeSourceCandidate,
} from "../../convex/lib/recipeImport/source";
import {
  formatImportAmount,
  type ImportAmount,
} from "../../convex/lib/recipeImport/measurements";
import { recipeForCorrection } from "../../convex/lib/recipeImport/validation";
import { validateDownloadedRecipeImage } from "../../convex/lib/recipeImport/images";
import { ImportFailure } from "../../convex/lib/recipeImport/contracts";
import {
  assertPublicResolvedAddresses,
  assertPublicUrlShape,
} from "../../convex/lib/recipeImport/network";
import {
  importOutputSchema,
  type ImportedRecipe,
  type RecipeImportModelClient,
  type StructuredModelTask,
} from "../../convex/lib/recipeImport/models";
import {
  isPrivateOrReservedAddress,
  selectBestRecipeImage,
} from "@/lib/domain/recipe-import";
import {
  createRecipeImportIntent,
  readRecipeImportIntent,
} from "@/lib/domain/auth-intents";
import {
  getRecipeReviewIssues,
  prepareRecipeContent,
} from "@/lib/domain/recipes";
import { buildRecipeRepairPatch } from "@/lib/domain/recipe-repair";
import { importFailureMessage } from "@/features/recipes/recipe-importer";
import {
  normaliseImportedDisplayAmount,
  normaliseImportedIngredientText,
} from "@/lib/domain/recipe-normalization";
import {
  formatIngredientAmount,
  formatIngredientName,
  formatIngredientNote,
} from "@/lib/domain/recipe-display";
import { deriveShoppingListItems } from "@/lib/domain/shopping-list";
import { createGatewayRecipeImportModelClient } from "../../convex/lib/recipeImport/models";
import { NoOutputGeneratedError } from "ai";
import {
  importJobAccess,
  importJobResumePath,
  hasImportJobLink,
} from "@/features/recipes/recipe-import-state";
import { main as evaluateRecipeImport } from "../../scripts/evaluate-recipe-import";

function recipeFor(source: RecipeSourceCandidate): ImportedRecipe {
  const id = (text: string) =>
    source.blocks.find((block) => block.text.includes(text))!.id;
  return {
    title: "Pepper salad",
    titleSourceIds: [id("Pepper salad")],
    description: null,
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    proteinCategory: "meat-free",
    ingredients: [
      {
        sourceIds: [id("1 large Red Pepper")],
        name: "large red pepper (capsicum / bell pepper)",
        amount: {
          kind: "exact",
          value: 1,
          unit: null,
          qualifier: null,
          equivalents: [],
        },
        note: "finely diced",
        group: null,
        noteRefs: [],
        shoppingCategory: "fruit_and_veg",
      },
    ],
    steps: [
      {
        sourceIds: [id("Dice and serve")],
        text: "Dice and serve.",
        timerCues: [],
        group: null,
        noteRefs: [],
      },
    ],
    notes: [],
  };
}
test("live evaluation rejects unknown case IDs before contacting a provider", async () => {
  const originalArgs = process.argv;
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  process.argv = [...originalArgs, "--case=does-not-exist"];
  process.env.AI_GATEWAY_API_KEY = "test-key-not-used";
  try {
    await expect(evaluateRecipeImport()).rejects.toThrow(
      "Unknown recipe evaluation cases: does-not-exist",
    );
  } finally {
    process.argv = originalArgs;
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalKey;
  }
});

test("keeps repeated pasted ingredients and nested/table source boundaries", () => {
  const pasted = extractTextCandidate(
    "Soup\nMain\n1 tbsp oil\nSauce\n1 tbsp oil\nMix.",
  );
  const oils = pasted.blocks.filter((block) => block.text === "1 tbsp oil");
  expect(oils).toHaveLength(2);
  expect(new Set(oils.map((block) => block.id)).size).toBe(2);
  const html = extractHtmlCandidate(
    '<article><h1>Soup</h1><a id="recipe"></a><table><tr><td>2</td><td>carrots</td></tr><tr><td>1 tbsp</td><td>oil</td></tr></table><ol><li>Make sauce<ul><li>Mix oil.</li></ul></li><li>Simmer for 20 minutes.</li></ol></article>',
    "https://example.com/soup",
  );
  expect(html.blocks.map((block) => block.text)).toEqual(
    expect.arrayContaining([
      "2 | carrots",
      "1 tbsp | oil",
      "Make sauce",
      "Mix oil.",
      "Simmer for 20 minutes.",
    ]),
  );
});

test("budgets visible recipe blocks before large supporting structured data", () => {
  const html = extractHtmlCandidate(
    `<article><h1>Soup</h1><div class="recipe-card"><p>2 carrots</p><p>Simmer for 20 minutes.</p></div></article><script type="application/ld+json">${JSON.stringify({ "@type": "Recipe", name: "Soup", description: "x".repeat(61000), recipeIngredient: ["2 carrots"] })}</script>`,
    "https://example.com/soup",
  );
  expect(html.truncated).toBe(true);
  expect(
    html.blocks.some((block) => block.text === "Simmer for 20 minutes."),
  ).toBe(true);
  expect(
    html.blocks.filter(
      (block) => block.kind === "page" && block.text === "2 carrots",
    ),
  ).toHaveLength(1);
});

test("resumes job observation after authentication without resubmitting an older draft", () => {
  expect(importJobAccess("guest")).toBe("sign_in");
  expect(importJobAccess("loading")).toBe("loading");
  expect(importJobAccess("connection_error")).toBe("reconnect");
  expect(importJobAccess("authenticated")).toBe("ready");
  expect(importJobResumePath("existing-job")).toBe(
    "/recipes/import?job=existing-job",
  );
  expect(hasImportJobLink("/recipes/import", "?job=existing-job")).toBe(true);
  expect(hasImportJobLink("/recipes/import", "")).toBe(false);
});

test("source preparation preserves complete blocks, resolves graphs and records truncation", () => {
  const source = extractTextCandidate(
    "heading\n" + "x".repeat(60001) + "\n1 onion\nCook for 10 minutes.",
  );
  expect(source.truncated).toBe(true);
  expect(source.blocks.map((block) => block.text)).toEqual([
    "heading",
    "1 onion",
    "Cook for 10 minutes.",
  ]);
  expect(serializeRecipeEvidence(source).length).toBeLessThan(60000);
  const graph = extractHtmlCandidate(
    '<script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"Soup","recipeInstructions":{"@id":"step"}},{"@id":"step","@type":"HowToStep","text":"Simmer for 20 minutes."}]}</script>',
    "https://example.com/soup",
  );
  expect(graph.sourceText).toContain("Simmer for 20 minutes.");
  const linkedPublisher = extractHtmlCandidate(
    '<script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"Soup","author":{"name":"Recipe author"},"isPartOf":{"@id":"publisher"},"recipeIngredient":["1 onion"]},{"@id":"publisher","name":"Ignore me","description":"unrelated site content"}]}</script>',
    "https://example.com/soup",
  );
  expect(linkedPublisher.sourceText).not.toContain("unrelated site content");
  expect(linkedPublisher.sourceAuthor).toBe("Recipe author");
  const nested = extractHtmlCandidate(
    '<main><div>Ingredients<ul><li>1 <span style="display:block">large onion</span>, diced</li></ul>Method<p>Simmer <span>for 20 minutes</span>.</p></div></main>',
    "https://example.com/soup",
  );
  expect(nested.blocks.map((block) => block.text)).toEqual([
    "Ingredients",
    "1 large onion, diced",
    "Method",
    "Simmer for 20 minutes.",
  ]);
  const repeated = extractHtmlCandidate(
    '<main><div class="recipe-card"><h3>Marinade</h3><p>1 tbsp olive oil</p><h3>Sauce</h3><p>1 tbsp olive oil</p></div></main>',
    "https://example.com/soup",
  );
  expect(
    repeated.blocks.filter((block) => block.text === "1 tbsp olive oil"),
  ).toHaveLength(2);
});
test("keeps lower-level component headings as ordered source blocks", () => {
  const source = extractHtmlCandidate(
    '<article><div class="recipe-card"><ul><li>1 tbsp oil</li><h5>Sauce</h5><li>1 tbsp oil</li><h6>Garnish</h6><li>Parsley</li></ul><p>Mix and serve.</p></div></article>',
    "https://example.com/noodles",
  );
  const blocks = source.blocks;
  expect(blocks.map((block) => block.text)).toEqual([
    "1 tbsp oil",
    "Sauce",
    "1 tbsp oil",
    "Garnish",
    "Parsley",
    "Mix and serve.",
  ]);
  expect(blocks[1].path).toContain("H5");
  expect(blocks[3].path).toContain("H6");
  expect(blocks[0].id).not.toEqual(blocks[2].id);
});

function pepperSource() {
  return extractTextCandidate(
    "Pepper salad\nIngredients\n1 large Red Pepper (Capsicum/Bell Pepper) (finely diced)\nMethod\nDice and serve.",
  );
}
function fakeClient(recipe: ImportedRecipe) {
  const roles: string[] = [];
  const client: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      if (task.role === "correct")
        return task.schema.parse({
          sourceStatus: "recipe",
          changes: [],
          issues: [],
        });
      return task.schema.parse({
        result: { status: "recipe", recipe, issues: [] },
      });
    },
  };
  return { client, roles };
}

function fixtureResponse<T>(
  task: StructuredModelTask<T>,
  response: unknown,
): T {
  if (task.role !== "correct") return task.schema.parse(response);
  const output = importOutputSchema.parse(response);
  if (output.result.status !== "recipe") throw new Error("Expected recipe");
  const proposed = JSON.parse(
    task.prompt.split("PROPOSED RECIPE\n")[1].split("\nPROPOSED ISSUES")[0],
  );
  return task.schema.parse({
    sourceStatus: "recipe",
    changes: Object.entries(output.result.recipe).map(([field, value]) => ({
      field,
      value: ["ingredients", "steps", "notes"].includes(field)
        ? [{ start: 0, remove: proposed[field].length, items: value }]
        : value,
    })),
    issues: output.result.issues,
  });
}
test("normalizes the screenshot and preserves consumer formatting", async () => {
  const source = pepperSource();
  const { client, roles } = fakeClient(recipeFor(source));
  const result = await organiseCandidate(source, client);
  expect(roles).toEqual(["normalize", "correct"]);
  expect(result.status).toBe("usable");
  expect(result.recipe.ingredients[0]).toMatchObject({
    name: "large red pepper (capsicum / bell pepper)",
    quantity: "1",
    note: "finely diced",
  });
  expect(formatIngredientAmount(result.recipe.ingredients[0])).toBe("1");
  expect(formatIngredientName(result.recipe.ingredients[0])).toBe(
    "large red pepper (capsicum / bell pepper)",
  );
  expect(formatIngredientNote(result.recipe.ingredients[0])).toBe(
    "finely diced",
  );
  expect(
    deriveShoppingListItems([
      {
        recipeId: "recipe-1",
        title: result.recipe.title,
        ingredients: result.recipe.ingredients,
      },
    ]),
  ).toHaveLength(1);
});
test("corpus method coverage follows referenced notes, not unrelated recipe notes", () => {
  const recipe = prepareRecipeContent({
    title: "Chicken",
    proteinCategory: "chicken",
    ingredients: [
      {
        id: "ingredient-1",
        name: "chicken",
        quantity: "2",
        amountText: "2",
        shoppingCategory: "meat_and_fish",
      },
    ],
    steps: [
      {
        id: "step-1",
        text: "Marinate the chicken, then roast.",
        noteRefs: ["note-1"],
      },
    ],
    notes: [{ id: "note-1", text: "Marinate for 30 minutes." }],
  });
  const item = {
    id: "referenced-duration",
    kind: "text" as const,
    expect: "succeeded" as const,
    expectedIngredientPatterns: [{ name: "chicken", amount: "^2$" }],
    expectedMethodPatterns: ["30 min", "roast"],
  };
  expect(score(recipe, item, {}).semanticPreservation).toBe(true);
  expect(
    score(
      {
        ...recipe,
        steps: [{ id: "step-1", text: "Marinate the chicken, then roast." }],
      },
      item,
      {},
    ).methodCoverage,
  ).toBe(false);
});
test("the evaluation-only parallel experiment resolves section note IDs within three calls", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].noteRefs = ["note-1"];
  recipe.steps[0].noteRefs = ["note-1"];
  const roles: string[] = [];
  const client = parallelBenchmarkClient({
    generate: async (task) => {
      roles.push(task.role);
      return task.schema.parse({
        result: {
          status: "recipe",
          recipe: {
            ...recipe,
            notes: [
              { id: "note-1", sourceIds: [], label: null, text: task.role },
            ],
          },
          issues: [],
        },
      });
    },
  });
  const task = {
    role: "normalize",
    primaryModel: "openai/gpt-5.4",
    schema: importOutputSchema,
    system: "test",
    prompt: "test",
  };
  const result = await client.generate(task);
  expect(result.result.status).toBe("recipe");
  if (result.result.status !== "recipe") throw new Error("Missing recipe");
  expect(result.result.recipe.ingredients[0].noteRefs).toEqual(["note-1"]);
  expect(result.result.recipe.steps[0].noteRefs).toEqual(["note-2"]);
  await client.generate({ ...task, role: "correct" });
  await expect(
    client.generate({ ...task, role: "recover" }),
  ).rejects.toMatchObject({ code: "invalid_model_output" });
  expect(roles).toEqual([
    "benchmark_ingredients",
    "benchmark_method",
    "correct",
  ]);
});
test("a checker timing disagreement cannot veto a usable recipe", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.cookMinutes = { value: 21, origin: "estimated", sourceIds: [] };
  const roles: string[] = [];
  const result = await organiseCandidate(source, {
    generate: async (task) => {
      roles.push(task.role);
      return fixtureResponse(task, {
        result: {
          status: "recipe",
          recipe,
          issues: [
            {
              area: "metadata",
              code: "source_conflict",
              targetId: null,
              message: "Publisher said 20, estimate says 21.",
              blocking: true,
            },
          ],
        },
      });
    },
  });
  expect(result.status).toBe("usable");
  expect(result.recipe.cookMinutes).toBe(21);
  expect(result.issues[0].blocking).toBe(false);
  expect(roles).toHaveLength(2);
});
test("confirmed missing essential content becomes a draft without a redundant recovery", async () => {
  const source = pepperSource();
  const recipe = { ...recipeFor(source), steps: [] };
  const { client, roles } = fakeClient(recipe);
  const result = await organiseCandidate(source, client);
  expect(result.status).toBe("draft");
  expect(result.recipe.ingredients).toHaveLength(1);
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ area: "method", blocking: true }),
    ]),
  );
  expect(roles).toEqual(["normalize", "correct"]);
});
test("correction repairs lost instructions rather than returning veto findings", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  const roles: string[] = [];
  const result = await organiseCandidate(source, {
    generate: async (task) => {
      roles.push(task.role);
      return fixtureResponse(task, {
        result: {
          status: "recipe",
          recipe: task.role === "normalize" ? { ...recipe, steps: [] } : recipe,
          issues: [],
        },
      });
    },
  });
  expect(result.status).toBe("usable");
  expect(result.recipe.steps).toHaveLength(1);
  expect(roles).toEqual(["normalize", "correct"]);
});
test("optional dangling note references cannot prevent saving", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].noteRefs = ["note-99"];
  const { client, roles } = fakeClient(recipe);
  const result = await organiseCandidate(source, client);
  expect(result.status).toBe("usable");
  expect(result.recipe.ingredients[0].noteRefs ?? []).toEqual([]);
  expect(result.normalizationWarnings).toContainEqual({
    area: "notes",
    code: "unresolved_reference",
    targetId: "ingredient-1",
  });
  expect(roles).toHaveLength(2);
});
test("optional advice cannot crowd missing method content out of a bounded draft", async () => {
  const source = pepperSource();
  const recipe = { ...recipeFor(source), steps: [] };
  const result = await organiseCandidate(source, {
    generate: async (task) =>
      fixtureResponse(task, {
        result: {
          status: "recipe",
          recipe,
          issues: Array.from({ length: 30 }, () => ({
            area: "metadata",
            code: "ambiguous",
            targetId: null,
            message: "Optional detail",
            blocking: false,
          })),
        },
      }),
  });
  expect(result.status).toBe("draft");
  expect(result.issues).toHaveLength(30);
  expect(result.issues[0]).toMatchObject({ area: "method", blocking: true });
});
test("malformed outputs use one shared recovery budget", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  const roles: string[] = [];
  const result = await organiseCandidate(source, {
    generate: async (task) => {
      roles.push(task.role);
      if (roles.length === 1)
        throw new ImportFailure(
          "invalid_model_output",
          "Missing structured output.",
        );
      return fixtureResponse(task, {
        result: { status: "recipe", recipe, issues: [] },
      });
    },
  });
  expect(result.status).toBe("usable");
  expect(roles).toEqual(["normalize", "recover", "correct"]);
  const calls: string[] = [];
  await expect(
    organiseCandidate(source, {
      generate: async (task) => {
        calls.push(task.role);
        return task.schema.parse({});
      },
    }),
  ).rejects.toThrow();
  expect(calls).toEqual(["normalize", "recover"]);
});
test("real SDK missing structured output is guarded and classified", async () => {
  const runner = (async () => {
    throw new NoOutputGeneratedError({ message: "No output" });
  }) as Parameters<typeof createGatewayRecipeImportModelClient>[1];
  const client = createGatewayRecipeImportModelClient(undefined, runner);
  await expect(
    client.generate({
      role: "normalize",
      primaryModel: "openai/gpt-5.4",
      schema: importOutputSchema,
      system: "test",
      prompt: "test",
    }),
  ).rejects.toMatchObject({ code: "invalid_model_output" });
});
test("non-recipes and AI outages fail without manufacturing recipe content", async () => {
  const source = pepperSource();
  await expect(
    organiseCandidate(source, {
      generate: async (task) =>
        task.schema.parse({ result: { status: "no_recipe" } }),
    }),
  ).rejects.toMatchObject({ code: "no_recipe" });
  await expect(
    organiseCandidate(source, {
      generate: async () => {
        throw new ImportFailure("ai_unavailable", "Unavailable");
      },
    }),
  ).rejects.toMatchObject({ code: "ai_unavailable" });
});
test("new format failures give truthful retry and pasted-text recovery copy", () => {
  expect(importFailureMessage("invalid_model_output").description).toContain(
    "format",
  );
  expect(importFailureMessage("source_blocked").description).toContain("Paste");
});
test("expired jobs do not call models", async () => {
  await expect(
    organiseCandidate(
      pepperSource(),
      {
        generate: async () => {
          throw new Error("Must not call");
        },
      },
      Date.now() - 1,
    ),
  ).rejects.toMatchObject({ code: "timed_out" });
});
test("JSON-LD is supporting evidence and cannot bypass AI", async () => {
  const source = extractHtmlCandidate(
    '<script type="application/ld+json">{"@type":"Recipe","name":"Pepper salad","recipeIngredient":["1 large Red Pepper"],"recipeInstructions":["Dice and serve."]}</script>',
    "https://example.com/recipe",
  );
  const { client, roles } = fakeClient(recipeFor(source));
  await organiseCandidate(source, client);
  expect(roles).toEqual(["normalize", "correct"]);
});
test("formatting keeps reliable metric conversions, packages and unknown quantities", () => {
  const exact = (
    value: number,
    unit: "lb" | "kg" | "l" | "cup" | null,
  ): ImportAmount => ({
    kind: "exact",
    value,
    unit,
    qualifier: null,
    equivalents: [],
  });
  expect(formatImportAmount(exact(2.2, "lb"))).toMatchObject({
    quantity: "998",
    unit: "g",
  });
  expect(formatImportAmount(exact(1, "kg"))).toMatchObject({
    quantity: "1000",
    unit: "g",
  });
  expect(formatImportAmount(exact(1.5, "l"))).toMatchObject({
    quantity: "1500",
    unit: "ml",
  });
  expect(formatImportAmount(exact(0.5, "cup"))).toMatchObject({
    amountText: "0.5 cup",
  });
  expect(
    formatImportAmount({
      kind: "package",
      count: 2,
      unit: "can",
      size: { value: 14, unit: "oz" },
      equivalents: [{ value: 400, unit: "g" }],
    }),
  ).toEqual({ amountText: "2 × 400 g cans" });
  expect(
    formatImportAmount({
      kind: "range",
      lower: 3,
      upper: 4,
      unit: "clove",
      qualifier: null,
    }),
  ).toMatchObject({ quantity: "3–4" });
  expect(formatImportAmount({ kind: "qualitative", text: "to taste" })).toEqual(
    { amountText: "to taste" },
  );
  expect(formatImportAmount({ kind: "unspecified" })).toEqual({});
});
test("formatted correction context resolves notes and numeric ingredient identities", () => {
  const recipe = recipeFor(pepperSource());
  recipe.ingredients[0].name = "5-spice powder";
  recipe.notes = [
    { id: "note-1", label: null, text: "Use mild spices.", sourceIds: [] },
  ];
  recipe.ingredients[0].noteRefs = ["note-1"];
  expect(recipeForCorrection(recipe).ingredients[0]).toMatchObject({
    name: "5-spice powder",
    index: 0,
    amount: recipe.ingredients[0].amount,
    displayAmount: "1",
    shoppingCategory: "fruit_and_veg",
    referencedNotes: [{ id: "note-1", text: "Use mild spices." }],
  });
  const schema = JSON.stringify(z.toJSONSchema(importOutputSchema));
  expect(schema).not.toContain('"oneOf"');
});
test("truncated supplementary content does not reject a complete recipe", async () => {
  const source = pepperSource();
  source.truncated = true;
  source.omittedBlocks = [{ kind: "page", path: "unrelated article" }];
  expect(
    (await organiseCandidate(source, fakeClient(recipeFor(source)).client))
      .status,
  ).toBe("usable");
});
test("unknown ingredient amounts remain unspecified and do not block saving", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].amount = { kind: "unspecified" };
  const result = await organiseCandidate(source, fakeClient(recipe).client);
  expect(result.status).toBe("usable");
  expect(result.recipe.servingScaling).toBe("source_only");
});
test("validates downloaded image bytes instead of trusting headers", () => {
  const largePng = pngHeader(1_200, 800);
  expect(validateDownloadedRecipeImage(largePng, "image/png")).toEqual({
    contentType: "image/png",
    width: 1_200,
    height: 800,
  });
  expect(validateDownloadedRecipeImage(largePng, "image/jpeg")).toBeNull();
  expect(validateDownloadedRecipeImage(pngHeader(300, 300), "image/png")).toBe(
    null,
  );
});

test("validates URL shape and the exact DNS addresses used for connection", () => {
  expect(() =>
    assertPublicUrlShape(new URL("https://recipes.example/dinner")),
  ).not.toThrow();
  expect(() =>
    assertPublicUrlShape(new URL("https://localhost/recipe")),
  ).toThrow();
  expect(() => assertPublicResolvedAddresses(["93.184.216.34"])).not.toThrow();
  expect(() =>
    assertPublicResolvedAddresses(["93.184.216.34", "127.0.0.1"]),
  ).toThrow();
});

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("bounds and validates recipe import resume intents", () => {
  const intent = createRecipeImportIntent({
    clientRequestId: "request-1",
    source: { type: "url", url: " https://example.com/recipe " },
    now: 1_725_000_000_000,
  });

  expect(intent.source).toEqual({
    type: "url",
    url: "https://example.com/recipe",
  });
  expect(readRecipeImportIntent({ ...intent, clientRequestId: "" })).toBeNull();
  expect(
    readRecipeImportIntent({
      ...intent,
      source: { type: "text", text: "too short" },
    }),
  ).toBeNull();
  expect(
    readRecipeImportIntent({
      ...intent,
      source: { type: "text", text: "x".repeat(80_001) },
    }),
  ).toBeNull();
});

test("derives review issues only for missing imported metadata", () => {
  expect(
    getRecipeReviewIssues({
      source: {
        type: "import",
        method: "url",
        importedAt: 1,
        normalizationWarnings: [
          { area: "ingredients", code: "ambiguous" },
          { area: "method", code: "partial_coverage" },
          { area: "notes", code: "unresolved_reference" },
          { area: "metadata", code: "source_conflict" },
        ],
      },
      servings: 4,
      prepMinutes: 20,
    }),
  ).toEqual([]);
  expect(
    getRecipeReviewIssues({
      source: { type: "import", method: "text", importedAt: 1 },
      prepMinutes: 0,
      cookMinutes: 0,
    }),
  ).toEqual(["servings"]);
  expect(
    getRecipeReviewIssues({
      source: { type: "import", method: "text", importedAt: 1 },
      prepMinutes: 15,
    }),
  ).toEqual(["servings"]);
  expect(
    getRecipeReviewIssues({
      source: { type: "import", method: "text", importedAt: 1 },
      servings: 2,
    }),
  ).toEqual(["prep_minutes", "cook_minutes"]);
  expect(
    getRecipeReviewIssues({
      source: { type: "manual" },
    }),
  ).toEqual([]);
});

test("validates one ordered method with sequential step groups", () => {
  const recipe = prepareRecipeContent({
    title: "Braised meatballs",
    proteinCategory: "beef",
    ingredients: [
      {
        id: "ingredient-1",
        name: "beef mince",
        shoppingCategory: "meat_and_fish",
      },
    ],
    steps: [
      { id: "stove-1", text: "Brown the meatballs.", group: "Meatballs" },
      { id: "stove-2", text: "Simmer in sauce.", group: "Sauce" },
    ],
  });

  expect(recipe.steps.map((step) => step.group)).toEqual([
    "Meatballs",
    "Sauce",
  ]);
});

test("prefers a recipe's full-size image over generated structured thumbnails", () => {
  expect(
    selectBestRecipeImage([
      {
        url: "https://images.example/salmon-225x225.jpg",
        source: "structured",
      },
      {
        url: "https://images.example/salmon-320x180.jpg",
        source: "structured",
      },
      {
        url: "https://images.example/salmon.jpg",
        source: "structured",
      },
    ]),
  ).toBe("https://images.example/salmon.jpg");
  expect(
    selectBestRecipeImage([
      {
        url: "https://images.example/salmon-card.jpg",
        source: "structured",
      },
      {
        url: "https://images.example/salmon-hero.jpg",
        source: "metadata",
        width: 1600,
        height: 2400,
      },
    ]),
  ).toBe("https://images.example/salmon-hero.jpg");
});

test("prefers qualified recipe imagery over a larger author portrait", () => {
  expect(
    selectBestRecipeImage([
      {
        url: "https://images.example/slow-cooker-chicken.jpg",
        source: "structured",
        width: 1200,
        height: 1800,
        alt: "A bowl of slow cooker green chile chicken",
      },
      {
        url: "https://images.example/slow-cooker-chicken.jpg",
        source: "metadata",
        width: 1200,
        height: 1800,
      },
      {
        url: "https://images.example/averie.jpg",
        source: "visible",
        width: 1242,
        height: 2208,
        alt: "A woman smiles at the camera while standing by the waterfront",
        context: "go-ad-free-with-face",
      },
    ]),
  ).toBe("https://images.example/slow-cooker-chicken.jpg");
});

test("rejects profile metadata when a visible recipe image is available", () => {
  expect(
    selectBestRecipeImage([
      {
        url: "https://images.example/author-profile.jpg",
        source: "metadata",
        width: 1800,
        height: 1800,
        alt: "Author portrait",
      },
      {
        url: "https://images.example/chicken-dinner.jpg",
        source: "visible",
        width: 1200,
        height: 800,
        alt: "Chicken dinner in a serving bowl",
      },
    ]),
  ).toBe("https://images.example/chicken-dinner.jpg");
});

test("repairs missing time with whichever trustworthy component is known", () => {
  expect(
    buildRecipeRepairPatch(["servings", "prep_minutes", "cook_minutes"], {
      servings: "2",
      prep_minutes: "15",
      cook_minutes: "",
    }),
  ).toEqual({ servings: 2, prepMinutes: 15 });
  expect(
    buildRecipeRepairPatch(["prep_minutes", "cook_minutes"], {
      prep_minutes: "",
      cook_minutes: "",
    }),
  ).toBeNull();
});

test("rejects private and reserved network targets", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.1",
    "192.0.2.4",
    "198.51.100.8",
    "203.0.113.9",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) {
    expect(isPrivateOrReservedAddress(address), address).toBe(true);
  }
  expect(isPrivateOrReservedAddress("8.8.8.8")).toBe(false);
  expect(isPrivateOrReservedAddress("2606:4700:4700::1111")).toBe(false);
});

test("normalises RecipeTin-style ingredients without splitting words", () => {
  expect(
    normaliseImportedIngredientText(
      "2 large chicken breasts , 200 – 250g / 7 – 9oz each (Note 1)",
    ),
  ).toMatchObject({
    amountText: "2",
    name: "large chicken breasts",
    note: "200 – 250g / 7 – 9oz each",
    noteRefs: ["note-1"],
  });
  expect(normaliseImportedIngredientText("2 garlic cloves")).toMatchObject({
    amountText: "2",
    name: "garlic cloves",
  });
  expect(normaliseImportedIngredientText("1 lemon")).toMatchObject({
    amountText: "1",
    name: "lemon",
  });
  expect(
    normaliseImportedIngredientText("20g / 1 1/2 tbsp unsalted butter"),
  ).toMatchObject({
    amountText: "20g / 1½ tbsp",
    name: "unsalted butter",
  });
});

test("repairs overlong imported amount text without losing compound measures", () => {
  expect(
    normaliseImportedDisplayAmount({
      amountText: "1 medium yellow onion, peeled and finely diced",
      quantity: "1",
      name: "yellow onion",
      note: "peeled and finely diced",
    }),
  ).toBe("1");
  expect(
    normaliseImportedDisplayAmount({
      amountText: "3 to 4 cloves garlic, finely minced",
      quantity: "3 to 4",
      name: "garlic",
      note: "finely minced",
    }),
  ).toBe("3 to 4");
  expect(
    normaliseImportedDisplayAmount({
      amountText: "20g / 1 1/2 tbsp",
      name: "unsalted butter",
    }),
  ).toBe("20g / 1½ tbsp");
});
