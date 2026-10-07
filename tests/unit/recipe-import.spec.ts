import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  checkSourceAmount,
  type ImportAmount,
} from "../../convex/lib/recipeImport/measurements";
import {
  recipeForVerification,
  validateImportedRecipe,
} from "../../convex/lib/recipeImport/validation";
import { validateDownloadedRecipeImage } from "../../convex/lib/recipeImport/images";
import { ImportFailure } from "../../convex/lib/recipeImport/contracts";
import {
  assertPublicResolvedAddresses,
  assertPublicUrlShape,
} from "../../convex/lib/recipeImport/network";
import {
  importOutputSchema,
  verificationSchema,
  type ImportedRecipe,
  type RecipeImportModelClient,
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
import { buildRecipeRepairPatch } from "@/features/recipes/recipe-review-drawer";
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
import { validateTiming } from "../../convex/lib/recipeImport/timing";
import {
  requiredMeasurementConfirmations,
  validateMeasurementConfirmations,
} from "../../convex/lib/recipeImport/validation";
import { createGatewayRecipeImportModelClient } from "../../convex/lib/recipeImport/models";
import { NoOutputGeneratedError, Output } from "ai";
import {
  importJobAccess,
  importJobResumePath,
  hasImportJobLink,
} from "@/features/recipes/recipe-import-state";
import {
  score,
  main as evaluateRecipeImport,
} from "../../scripts/evaluate-recipe-import";

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
    timingBasis: {
      totalMinutes: null,
      summary: "No duration supplied by the test source.",
      unresolvedReason: "Timing unavailable in this injected test result.",
    },
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
        group: null,
        noteRefs: [],
      },
    ],
    notes: [],
  };
}
function sourceSupportsAmount(amount: ImportAmount, source: string) {
  return checkSourceAmount(amount, source) === "supported";
}

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

test("distinguishes unfamiliar notation from explicit quantity conflicts", () => {
  const cup = (value: number): ImportAmount => ({
    kind: "exact",
    value,
    unit: "cup",
    qualifier: null,
    equivalents: [],
  });
  expect(checkSourceAmount(cup(0.375), "⅜ cup milk")).toBe("supported");
  expect(checkSourceAmount(cup(0.5), "1⁄2 cup milk")).toBe("supported");
  expect(checkSourceAmount(cup(1.5), "1½ cup milk")).toBe("supported");
  expect(checkSourceAmount(cup(1), "one cup milk")).toBe("inconclusive");
  expect(checkSourceAmount(cup(2), "2 c milk")).toBe("inconclusive");
  expect(
    checkSourceAmount(
      { kind: "range", lower: 1, upper: 2, unit: "clove", qualifier: null },
      "1 to 2 large cloves garlic",
    ),
  ).toBe("inconclusive");
  expect(checkSourceAmount(cup(3), "2 cups milk")).toBe("conflicting");
});

test("requires positive independent confirmation of unfamiliar amounts", async () => {
  const source = pepperSource();
  source.blocks.push({
    id: "B99",
    kind: "text",
    text: "one teaspoon 5-spice powder",
  });
  const recipe = recipeFor(source);
  recipe.ingredients.push({
    ...recipe.ingredients[0],
    name: "5-spice powder",
    sourceIds: ["B99"],
    note: null,
    amount: {
      kind: "exact",
      value: 1,
      unit: "tsp",
      qualifier: null,
      equivalents: [],
    },
  });
  expect(validateImportedRecipe(recipe, source)).toEqual([]);
  expect(requiredMeasurementConfirmations(recipe, source)).toEqual([2]);
  const roles: string[] = [];
  await expect(
    organiseCandidate(source, {
      async generate(task) {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "verify"
            ? { findings: [], confirmedMeasurements: [] }
            : { result: { status: "recipe", recipe } },
        );
      },
    }),
  ).rejects.toMatchObject({ code: "unsafe_result", reasons: ["measurement"] });
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
  expect(
    (await organiseCandidate(source, fakeClient(recipe).client)).recipe
      .ingredients[1].name,
  ).toBe("5-spice powder");
});

test("SDK malformed and missing structured output enter bounded repair", async () => {
  let malformed: unknown;
  try {
    await Output.object({
      schema: z.object({ value: z.number() }),
    }).parseCompleteOutput(
      { text: '{"value":"bad"}' },
      {
        response: { id: "fixture", timestamp: new Date(0), modelId: "fixture" },
        usage: {} as never,
        finishReason: "stop",
      },
    );
  } catch (error) {
    malformed = error;
  }
  expect((malformed as Error).name).toBe("AI_NoObjectGeneratedError");
  for (const error of [malformed, new NoOutputGeneratedError()]) {
    const adapter = createGatewayRecipeImportModelClient(
      undefined,
      async () => {
        throw error;
      },
    );
    await expect(
      adapter.generate({
        role: "extract",
        primaryModel: "fixture",
        schema: importOutputSchema,
        system: "",
        prompt: "",
      }),
    ).rejects.toMatchObject({ code: "unsafe_result", details: ["contract"] });
    const recipe = recipeFor(pepperSource());
    let calls = 0;
    await organiseCandidate(pepperSource(), {
      async generate(task) {
        calls++;
        if (task.role === "extract") return adapter.generate(task);
        return task.schema.parse(
          task.role === "verify"
            ? { findings: [], confirmedMeasurements: [] }
            : { result: { status: "recipe", recipe } },
        );
      },
    });
    expect(calls).toBe(3);
  }
  const outage = createGatewayRecipeImportModelClient(undefined, async () => {
    throw new Error("Provider offline");
  });
  await expect(
    outage.generate({
      role: "extract",
      primaryModel: "fixture",
      schema: importOutputSchema,
      system: "",
      prompt: "",
    }),
  ).rejects.toMatchObject({ code: "ai_unavailable" });
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

test("evaluation rejects lost method content even when ingredient and step counts still pass", () => {
  const content = prepareRecipeContent({
    title: "Carrot soup",
    proteinCategory: "meat-free",
    ingredients: [
      {
        id: "i1",
        name: "carrots",
        quantity: "2",
        amountText: "2",
        shoppingCategory: "fruit_and_veg",
      },
    ],
    steps: [{ id: "s1", text: "Simmer for 20 minutes, then blend and serve." }],
  });
  const expected = {
    id: "fixture",
    kind: "text" as const,
    expect: "succeeded" as const,
    expectedIngredientPatterns: [{ name: "carrot", amount: "^2$" }],
    expectedMethodPatterns: ["20 min", "blend"],
  };
  expect(score(content, expected, {})).toMatchObject({
    core: true,
    semanticPreservation: true,
    methodCoverage: true,
  });
  expect(
    score(
      { ...content, steps: [{ id: "s1", text: "Heat and serve." }] },
      expected,
      {},
    ),
  ).toMatchObject({
    core: true,
    semanticPreservation: false,
    methodCoverage: false,
  });
  expect(
    score(
      {
        ...content,
        ingredients: [
          { ...content.ingredients[0], noteRefs: ["missing-note"] },
        ],
      },
      expected,
      {},
    ),
  ).toMatchObject({ semanticPreservation: false, noteResolution: false });
  const pepper = {
    ...content,
    ingredients: [
      { ...content.ingredients[0], name: "red pepper (capsicum/bell pepper)" },
    ],
  };
  const pepperExpectation = {
    ...expected,
    expectedIngredientPatterns: [],
    expectedIngredients: [
      { name: "red pepper (capsicum / bell pepper)", amountText: "2" },
    ],
  };
  expect(score(pepper, pepperExpectation, {})).toMatchObject({
    measurementAccuracy: true,
  });
  expect(
    score(
      {
        ...pepper,
        ingredients: [{ ...pepper.ingredients[0], amountText: "3" }],
      },
      pepperExpectation,
      {},
    ),
  ).toMatchObject({ measurementAccuracy: false });
  expect(
    score(
      {
        ...pepper,
        ingredients: [{ ...pepper.ingredients[0], name: "red pepper" }],
      },
      pepperExpectation,
      {},
    ),
  ).toMatchObject({ semanticPreservation: false });
});
function pepperSource() {
  return extractTextCandidate(
    "Pepper salad\nIngredients\n1 large Red Pepper (Capsicum/Bell Pepper) (finely diced)\nMethod\nDice and serve.",
  );
}
function fakeClient(
  recipe: ImportedRecipe,
  audit: { area: "method"; code: "omission"; sourceIds: string[] }[] = [],
) {
  const roles: string[] = [];
  const client: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      return task.schema.parse(
        task.role === "verify"
          ? {
              findings: audit.map((finding) => ({
                ...finding,
                detail: null,
                metadataField: null,
              })),
              confirmedMeasurements: recipe.ingredients.map(
                (_, index) => index + 1,
              ),
            }
          : { result: { status: "recipe", recipe } },
      );
    },
  };
  return { client, roles };
}
test("AI normalizes the screenshot ingredient into independent amount, identity and preparation", async () => {
  const source = pepperSource();
  const { client, roles } = fakeClient(recipeFor(source));
  const { recipe } = await organiseCandidate(source, client);
  expect(roles).toEqual(["extract", "verify"]);
  const ingredient = recipe.ingredients[0];
  expect(formatIngredientAmount(ingredient)).toBe("1");
  expect(formatIngredientName(ingredient)).toBe(
    "large red pepper (capsicum / bell pepper)",
  );
  expect(formatIngredientNote(ingredient)).toBe("finely diced");
  expect(ingredient.sourceText).toBe(
    "1 large Red Pepper (Capsicum/Bell Pepper) (finely diced)",
  );
  expect(
    deriveShoppingListItems([
      {
        recipeId: "test",
        title: recipe.title,
        ingredients: recipe.ingredients,
      },
    ])[0],
  ).toMatchObject({
    category: "fruit_and_veg",
    displayName: "1 large red pepper (capsicum / bell pepper)",
  });
});
test("complete JSON-LD and pasted sources always use AI and verification", async () => {
  const html = readFileSync(
    resolve("tests/fixtures/complete-json-ld.html"),
    "utf8",
  );
  const source = extractHtmlCandidate(html, "https://recipes.example/post");
  const id = (text: string) =>
    source.blocks.find((block) => block.text === text)!.id;
  const recipe = recipeFor(pepperSource());
  recipe.title = "Lemon chicken";
  recipe.titleSourceIds = [id("Lemon chicken")];
  recipe.proteinCategory = "chicken";
  recipe.ingredients = [
    {
      ...recipe.ingredients[0],
      sourceIds: [id("4 chicken thighs")],
      name: "chicken thighs",
      note: null,
      amount: {
        kind: "exact",
        value: 4,
        unit: null,
        qualifier: null,
        equivalents: [],
      },
      shoppingCategory: "meat_and_fish",
    },
  ];
  recipe.steps = [
    {
      sourceIds: [id("Season the chicken.")],
      text: "Season the chicken.",
      group: null,
      noteRefs: [],
    },
    {
      sourceIds: [id("Roast until cooked through.")],
      text: "Roast until cooked through.",
      group: null,
      noteRefs: [],
    },
  ];
  const { client, roles } = fakeClient(recipe);
  await organiseCandidate(source, client);
  expect(roles).toEqual(["extract", "verify"]);
  expect(
    source.blocks.some((block) => block.path?.includes("recipeIngredient")),
  ).toBe(true);
});
test("retries a malformed contract once and never falls back to source-shaped ingredients", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  const roles: string[] = [];
  const client: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      if (task.role === "extract")
        throw new ImportFailure("unsafe_result", "Invalid contract", [
          "contract",
        ]);
      return task.schema.parse(
        task.role === "verify"
          ? { findings: [], confirmedMeasurements: [] }
          : { result: { status: "recipe", recipe } },
      );
    },
  };
  expect(
    (await organiseCandidate(source, client)).recipe.ingredients[0].name,
  ).toBe(recipe.ingredients[0].name);
  expect(roles).toEqual(["extract", "repair", "verify"]);
});
test("repairs omitted timed instructions with concrete verification feedback", async () => {
  const source = pepperSource();
  source.blocks.push({
    id: "B6",
    kind: "text",
    text: "Simmer for 10 minutes, then serve.",
  });
  const recipe = recipeFor(source);
  recipe.steps = [
    { ...recipe.steps[0], sourceIds: ["B6"], text: "Simmer, then serve." },
  ];
  const roles: string[] = [];
  let audits = 0;
  const client: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      if (task.role === "repair") {
        expect(task.prompt).toContain('"code":"instruction"');
        recipe.steps[0].text = "Simmer for 10 minutes, then serve.";
      }
      return task.schema.parse(
        task.role === "verify"
          ? {
              confirmedMeasurements: [],
              findings:
                audits++ === 0
                  ? [
                      {
                        area: "method",
                        metadataField: null,
                        code: "instruction",
                        detail:
                          "Preserve the cooking duration from the source.",
                        sourceIds: recipe.steps[0].sourceIds,
                      },
                    ]
                  : [],
            }
          : { result: { status: "recipe", recipe } },
      );
    },
  };
  const result = await organiseCandidate(source, client);
  expect(result.recipe.steps[0].text).toBe(
    "Simmer for 10 minutes, then serve.",
  );
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
});
test("persistent semantic failures reject with safe area and source diagnostics", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  const { client, roles } = fakeClient(recipe, [
    { area: "method", code: "omission", sourceIds: recipe.steps[0].sourceIds },
  ]);
  await expect(organiseCandidate(source, client)).rejects.toMatchObject({
    code: "unsafe_result",
    details: ["method"],
    sourceIds: recipe.steps[0].sourceIds,
  });
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
});
test("non-recipe and incomplete responses require no dummy content; outages never create recipes", async () => {
  for (const status of ["no_recipe", "incomplete_recipe"] as const) {
    const client: RecipeImportModelClient = {
      generate: async (task) =>
        task.schema.parse(
          task.role === "verify"
            ? {
                findings: [
                  {
                    area: "method",
                    metadataField: null,
                    code: "omission",
                    sourceIds: [],
                    detail: "The method is unavailable.",
                  },
                ],
                confirmedMeasurements: [],
              }
            : {
                result: {
                  status,
                  ...(status === "incomplete_recipe" ? { sourceIds: [] } : {}),
                },
              },
        ),
    };
    await expect(
      organiseCandidate(pepperSource(), client),
    ).rejects.toMatchObject({ code: status });
  }
  const unavailable: RecipeImportModelClient = {
    generate: async () => {
      throw new ImportFailure("ai_unavailable", "Unavailable");
    },
  };
  await expect(
    organiseCandidate(pepperSource(), unavailable),
  ).rejects.toMatchObject({ code: "ai_unavailable" });
});
test("pasted ingredients and method support suggested metadata and recover a mistaken incomplete assessment", async () => {
  const source = pepperSource();
  const suggested = recipeFor(source);
  source.blocks = source.blocks.filter(
    (block) => block.text !== "Pepper salad",
  );
  suggested.titleSourceIds = suggested.ingredients[0].sourceIds;
  suggested.description = "A finely diced pepper salad.";
  const roles: string[] = [];
  const result = await organiseCandidate(source, {
    generate: async (task) => {
      roles.push(task.role);
      expect(task.system).toContain(
        "A missing title, description, photo, servings or prep/cook labels NEVER makes a recipe incomplete",
      );
      expect(task.prompt).toContain('"sourceType":"pasted_text"');
      return task.schema.parse(
        task.role === "extract"
          ? {
              result: {
                status: "incomplete_recipe",
                sourceIds: suggested.titleSourceIds,
              },
            }
          : task.role === "repair"
            ? { result: { status: "recipe", recipe: suggested } }
            : { findings: [], confirmedMeasurements: [] },
      );
    },
  });
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
  expect(result.recipe.title).toBe("Pepper salad");
  expect(result.recipe.description).toBe("A finely diced pepper salad.");
  expect(result.recipe.servings).toBeUndefined();
  expect(
    getRecipeReviewIssues({
      ...result.recipe,
      source: { type: "import", method: "text", importedAt: 0 },
    }),
  ).toContain("servings");
});

test("unconfirmed incomplete assessments cannot masquerade as missing recipe content", async () => {
  const roles: string[] = [];
  await expect(
    organiseCandidate(pepperSource(), {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "verify"
            ? { findings: [], confirmedMeasurements: [] }
            : { result: { status: "incomplete_recipe", sourceIds: [] } },
        );
      },
    }),
  ).rejects.toMatchObject({ code: "unsafe_result" });
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
});

test("incomplete feedback names confirmed missing content, not optional metadata", () => {
  expect(
    importFailureMessage("incomplete_recipe", ["method"]).description,
  ).toContain("enough cooking instructions");
  expect(
    importFailureMessage("incomplete_recipe", ["ingredients"]).description,
  ).toContain("enough ingredient information");
  expect(importFailureMessage("incomplete_recipe").description).toContain(
    "not required",
  );
});

test("omits only specifically disputed inferred metadata after repair; published facts and cooking defects still block", async () => {
  for (const scenario of [
    "inferred",
    "published",
    "method",
    "unclassified",
  ] as const) {
    const source = pepperSource();
    const recipe = recipeFor(source);
    recipe.cookMinutes = {
      value: 10,
      origin: scenario === "published" ? "published" : "estimated",
      sourceIds: recipe.steps[0].sourceIds,
    };
    const roles: string[] = [];
    const result = organiseCandidate(source, {
      generate: async (task) => {
        roles.push(task.role);
        return task.schema.parse(
          task.role === "verify"
            ? {
                findings: [
                  {
                    area: scenario === "method" ? "method" : "metadata",
                    code: "measurement",
                    metadataField:
                      scenario === "unclassified" ? null : "cookMinutes",
                    sourceIds: recipe.steps[0].sourceIds,
                    detail: "The proposed duration is unsupported.",
                  },
                ],
                confirmedMeasurements: [],
              }
            : { result: { status: "recipe", recipe } },
        );
      },
    });
    if (scenario === "inferred") {
      const saved = await result;
      expect(saved.recipe.cookMinutes).toBeUndefined();
      expect(saved.metadataProvenance.cookMinutes).toBeUndefined();
      expect(saved.recipe.ingredients).toHaveLength(1);
      expect(saved.recipe.steps).toHaveLength(1);
    } else
      await expect(result).rejects.toMatchObject({ code: "unsafe_result" });
    expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
  }
});
test("metadata recovery cannot hide an unchecked ingredient behind thirty audit findings", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].amount = { kind: "unspecified" };
  recipe.cookMinutes = {
    value: 10,
    origin: "estimated",
    sourceIds: recipe.steps[0].sourceIds,
  };
  await expect(
    organiseCandidate(source, {
      generate: async (task) =>
        task.schema.parse(
          task.role === "verify"
            ? {
                findings: Array.from({ length: 30 }, () => ({
                  area: "metadata",
                  code: "measurement",
                  metadataField: "cookMinutes",
                  sourceIds: recipe.steps[0].sourceIds,
                  detail: "The inferred duration is unsupported.",
                })),
                confirmedMeasurements: [],
              }
            : { result: { status: "recipe", recipe } },
        ),
    }),
  ).rejects.toMatchObject({
    code: "unsafe_result",
    details: expect.arrayContaining(["ingredients"]),
    reasons: ["measurement"],
  });
});

test("rejects fabricated measurements and unresolved notes before saving", () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].amount = {
    kind: "exact",
    value: 10,
    unit: "kg",
    qualifier: null,
    equivalents: [],
  };
  recipe.ingredients[0].noteRefs = ["note-4"];
  expect(
    [
      ...validateImportedRecipe(recipe, source),
      ...validateMeasurementConfirmations(
        recipe,
        requiredMeasurementConfirmations(recipe, source),
        [],
      ),
    ].map((finding) => finding.code),
  ).toEqual(expect.arrayContaining(["measurement", "note_reference"]));
});
test("ingredient sizes cannot masquerade as measurement qualifiers", () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  recipe.ingredients[0].amount = {
    kind: "exact",
    value: 1,
    unit: null,
    qualifier: "large",
    equivalents: [],
  };
  expect(validateImportedRecipe(recipe, source)).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: "formatting" })]),
  );
});
test("measurement evidence is checked per complete block regardless of citation order", () => {
  const source = pepperSource();
  source.blocks.push({
    id: "B6",
    kind: "page",
    text: "▢ 1 large Red Pepper (Capsicum/Bell Pepper) (finely diced)",
  });
  const recipe = recipeFor(source);
  recipe.ingredients[0].sourceIds.unshift("B6");
  expect(validateImportedRecipe(recipe, source)).toEqual([]);
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
test("formats and validates metric equivalents, packages, fractions, ranges and qualitative amounts", () => {
  const exact = (
    value: number,
    unit: "lb" | "oz" | "cup" | "tbsp" | null,
  ): Extract<ImportAmount, { kind: "exact" }> => ({
    kind: "exact",
    value,
    unit,
    qualifier: null,
    equivalents: [],
  });
  expect(formatImportAmount(exact(2.2, "lb"))).toMatchObject({
    quantity: "998",
    unit: "g",
    amountText: "998 g",
  });
  const metric: ImportAmount = {
    ...exact(2.2, "lb"),
    kind: "exact",
    value: 2.2,
    unit: "lb",
    qualifier: null,
    equivalents: [{ value: 1, unit: "kg" }],
  };
  expect(formatImportAmount(metric)).toMatchObject({
    quantity: "1",
    unit: "kg",
  });
  expect(sourceSupportsAmount(metric, "2.2lbs / 1kg beef")).toBe(true);
  expect(sourceSupportsAmount(exact(1, "kg" as never), "2.2 lb beef")).toBe(
    true,
  );
  expect(sourceSupportsAmount(exact(0.5, "tbsp"), "½ tbsp oil")).toBe(true);
  expect(
    sourceSupportsAmount(
      { ...exact(2, "tbsp"), qualifier: "heaped" },
      "2 heaped tbsp tomato puree",
    ),
  ).toBe(true);
  expect(formatImportAmount(exact(1.5, "cup"))).toMatchObject({
    amountText: "1.5 cup",
  });
  const pack: ImportAmount = {
    kind: "package",
    count: 2,
    unit: "can",
    size: { value: 14, unit: "oz" },
    equivalents: [{ value: 400, unit: "g" }],
  };
  expect(formatImportAmount(pack)).toEqual({ amountText: "2 × 400 g cans" });
  expect(sourceSupportsAmount(pack, "2x 14oz/400g cans tomatoes")).toBe(true);
  expect(
    formatImportAmount({
      kind: "range",
      lower: 3,
      upper: 4,
      unit: "clove",
      qualifier: null,
    }),
  ).toMatchObject({ quantity: "3–4", amountText: "3–4 clove" });
  expect(
    sourceSupportsAmount(
      { kind: "range", lower: 3, upper: 4, unit: "clove", qualifier: null },
      "3 to 4 cloves garlic",
    ),
  ).toBe(true);
  expect(formatImportAmount({ kind: "qualitative", text: "to taste" })).toEqual(
    { amountText: "to taste" },
  );
  expect(formatImportAmount({ kind: "unspecified" })).toEqual({});
});
test("accepts article-led and hyphenated package measurements without inventing counts or sizes", () => {
  const packet: ImportAmount = {
    kind: "package",
    count: 1,
    unit: "packet",
    size: { value: 250, unit: "g" },
    equivalents: [{ value: 8.8, unit: "oz" }],
  };
  const text = "A 250-gram or 8.8-ounce package dried noodles";
  expect(sourceSupportsAmount(packet, text)).toBe(true);
  expect(formatImportAmount(packet)).toEqual({
    amountText: "1 × 250 g packet",
  });
  expect(sourceSupportsAmount({ ...packet, count: 2 }, text)).toBe(false);
  expect(
    sourceSupportsAmount({ ...packet, size: { value: 500, unit: "g" } }, text),
  ).toBe(false);
  expect(sourceSupportsAmount(packet, "A small package noodles")).toBe(false);
  expect(sourceSupportsAmount(packet, "250-gram or 8.8-ounce noodles")).toBe(
    false,
  );
  expect(
    sourceSupportsAmount(
      {
        kind: "exact",
        value: 250,
        unit: "g",
        qualifier: null,
        equivalents: [],
      },
      "250-gram noodles",
    ),
  ).toBe(true);
});

test("validates sized counts behind generic recipe checklist markers", () => {
  const amount = {
    kind: "exact" as const,
    value: 3,
    unit: "clove" as const,
    qualifier: null,
    equivalents: [],
  };
  for (const marker of ["", "▢", "☐", "☑", "•", "◦", "□"])
    expect(
      sourceSupportsAmount(amount, `${marker} 3 large cloves of garlic, diced`),
    ).toBe(true);
  expect(
    sourceSupportsAmount({ ...amount, value: 4 }, "▢ 3 large cloves of garlic"),
  ).toBe(false);
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

test("preserves quantified choices and identical amounts in different components through persistence formatting", async () => {
  const source = pepperSource();
  const recipe = recipeFor(source);
  const append = (text: string) => {
    const id = `B${source.blocks.length + 1}`;
    source.blocks.push({ kind: "text", text, id });
    return [id];
  };
  const line = recipe.ingredients[0];
  recipe.ingredients = [
    {
      ...line,
      sourceIds: append("1 onion or 3 spring onions, sliced"),
      name: "onion",
      note: "or 3 spring onions, sliced",
    },
    ...["Vegetables", "Sauce"].map((group) => ({
      ...line,
      sourceIds: append("1 tablespoon toasted sesame oil"),
      name: "toasted sesame oil",
      amount: {
        kind: "exact" as const,
        value: 1,
        unit: "tbsp" as const,
        qualifier: null,
        equivalents: [],
      },
      note: null,
      group,
    })),
  ];
  const result = await organiseCandidate(source, fakeClient(recipe).client);
  expect(result.recipe.ingredients).toHaveLength(3);
  expect(result.recipe.ingredients[0]).toMatchObject({
    name: "onion",
    amountText: "1",
    note: "or 3 spring onions, sliced",
  });
  expect(result.recipe.ingredients.slice(1).map((item) => item.group)).toEqual([
    "Vegetables",
    "Sauce",
  ]);
  expect(
    result.recipe.ingredients.slice(1).map((item) => item.amountText),
  ).toEqual(["1 tbsp", "1 tbsp"]);
});

test("validates inferred time arithmetic without overriding published components", () => {
  const recipe = recipeFor(pepperSource());
  const time = (
    value: number,
    origin: "published" | "derived" | "estimated",
  ) => ({ value, origin, sourceIds: ["B1"] });
  recipe.timingBasis = {
    totalMinutes: time(45, "published"),
    summary: "Roast 12 minutes, then bake up to 18; boiling overlaps.",
    unresolvedReason: null,
  };
  expect(validateTiming(recipe)).toEqual([
    expect.objectContaining({ code: "omission" }),
  ]);
  recipe.prepMinutes = time(45, "estimated");
  recipe.cookMinutes = time(30, "derived");
  expect(validateTiming(recipe)).toEqual([
    expect.objectContaining({ code: "measurement" }),
  ]);
  recipe.prepMinutes = time(15, "estimated");
  expect(validateTiming(recipe)).toEqual([]);
  recipe.prepMinutes = time(20, "published");
  recipe.cookMinutes = time(30, "published");
  expect(validateTiming(recipe)).toEqual([]);
  recipe.timingBasis.totalMinutes = null;
  recipe.cookMinutes = null;
  recipe.timingBasis.unresolvedReason =
    "The fermentation ends only when mature, with no bounded duration.";
  expect(validateTiming(recipe)).toEqual([]);
});

test("repairs missing inferable timing and persists provenance without the transient timing basis", async () => {
  const source = pepperSource();
  source.blocks.push({
    kind: "text",
    id: "B7",
    text: "Total 45 minutes. Roast 12 minutes, meanwhile boil 5 minutes, then bake 15-18 minutes.",
  });
  const original = recipeFor(source);
  original.timingBasis.unresolvedReason =
    "No separately labelled prep or cook times.";
  const repaired: ImportedRecipe = {
    ...original,
    prepMinutes: { value: 15, origin: "estimated", sourceIds: ["B7"] },
    cookMinutes: { value: 30, origin: "derived", sourceIds: ["B7"] },
    timingBasis: {
      totalMinutes: { value: 45, origin: "published", sourceIds: ["B7"] },
      summary:
        "12 plus 18 cooking; boiling overlaps. Remaining 15 is prep allowance.",
      unresolvedReason: null,
    },
  };
  const roles: string[] = [];
  const outcome = await organiseCandidate(source, {
    async generate(task) {
      roles.push(task.role);
      if (task.role === "verify") {
        expect(task.prompt).toContain("timingBasis");
        return task.schema.parse({
          confirmedMeasurements: [],
          findings:
            roles.length === 2
              ? [
                  {
                    area: "metadata",
                    metadataField: null,
                    code: "omission",
                    sourceIds: ["B7"],
                    detail:
                      "Resolve the published total and overlapping cooking phases rather than leaving both times null.",
                  },
                ]
              : [],
        });
      }
      if (task.role === "repair")
        expect(task.prompt).toContain("overlapping cooking phases");
      return task.schema.parse({
        result: {
          status: "recipe",
          recipe: task.role === "repair" ? repaired : original,
        },
      });
    },
  });
  expect(roles).toEqual(["extract", "verify", "repair", "verify"]);
  expect(outcome.recipe).toMatchObject({ prepMinutes: 15, cookMinutes: 30 });
  expect(outcome.metadataProvenance).toMatchObject({
    prepMinutes: "estimated",
    cookMinutes: "derived",
  });
  expect(outcome.recipe).not.toHaveProperty("timingBasis");
});

test("independent verification repairs dishonest timing provenance without changing explicit durations", async () => {
  const source = pepperSource();
  source.blocks.push({
    kind: "text",
    id: "B7",
    text: "Spend 5 minutes chopping the pepper. Cook for 20 minutes.",
  });
  const original = recipeFor(source);
  original.prepMinutes = { value: 5, origin: "estimated", sourceIds: ["B7"] };
  original.cookMinutes = { value: 20, origin: "derived", sourceIds: ["B7"] };
  original.timingBasis.unresolvedReason = null;
  const repaired: ImportedRecipe = {
    ...original,
    prepMinutes: { value: 5, origin: "derived", sourceIds: ["B7"] },
  };
  let verifications = 0;
  const outcome = await organiseCandidate(source, {
    async generate(task) {
      expect(task.system).toContain("explicitly timed preparation action");
      expect(task.system).toContain("not ingredient alternatives");
      expect(task.system).toContain("NOT the primary amount");
      expect(task.system).toContain("per-item weight range");
      expect(task.system).toContain(
        "ALWAYS preserve these separately in recipe notes",
      );
      if (task.role === "verify") {
        verifications += 1;
        return task.schema.parse({
          confirmedMeasurements: [],
          findings:
            verifications === 1
              ? [
                  {
                    area: "metadata",
                    metadataField: null,
                    code: "formatting",
                    sourceIds: ["B7"],
                    detail:
                      "Prep 5 is derived from 'Spend 5 minutes chopping', not estimated.",
                  },
                ]
              : [],
        });
      }
      if (task.role === "repair")
        expect(task.prompt).toContain("not estimated");
      return task.schema.parse({
        result: {
          status: "recipe",
          recipe: task.role === "repair" ? repaired : original,
        },
      });
    },
  });
  expect(verifications).toBe(2);
  expect(outcome.recipe).toMatchObject({ prepMinutes: 5, cookMinutes: 20 });
  expect(outcome.metadataProvenance).toMatchObject({
    prepMinutes: "derived",
    cookMinutes: "derived",
  });
});

test("AI schemas use provider-compatible tagged unions without oneOf", () => {
  for (const schema of [importOutputSchema, verificationSchema])
    expect(JSON.stringify(z.toJSONSchema(schema))).not.toContain('"oneOf"');
});
test("verification receives formatted measurements and resolved notes", () => {
  const recipe = recipeFor(pepperSource());
  recipe.notes = [
    {
      id: "note-1",
      sourceIds: ["B1"],
      label: "1",
      text: "Keep the pepper finely diced.",
    },
  ];
  recipe.ingredients[0].noteRefs = ["note-1"];
  recipe.ingredients[0].amount = {
    kind: "exact",
    value: 1.5,
    unit: "lb",
    equivalents: [],
    qualifier: null,
  };
  expect(recipeForVerification(recipe).ingredients[0]).toMatchObject({
    amount: "680 g",
    preparation: "finely diced",
    referencedNotes: [{ id: "note-1", text: "Keep the pepper finely diced." }],
  });
});
test("expired jobs never call AI", async () => {
  const { client, roles } = fakeClient(recipeFor(pepperSource()));
  await expect(
    organiseCandidate(pepperSource(), client, Date.now() - 1),
  ).rejects.toMatchObject({ code: "timed_out" });
  expect(roles).toEqual([]);
});
test("shared EACH quantities remain individually validated against the same evidence", async () => {
  const source = pepperSource();
  const shared = extractTextCandidate(
    "2 tbsp EACH: paprika, cumin, chilli powder",
  ).blocks[0];
  shared.id = "B100";
  source.blocks.push(shared);
  const recipe = recipeFor(source);
  recipe.ingredients.push(
    ...["paprika", "cumin", "chilli powder"].map((name) => ({
      sourceIds: ["B100"],
      name,
      amount: {
        kind: "exact" as const,
        value: 2,
        unit: "tbsp" as const,
        qualifier: null,
        equivalents: [],
      },
      note: null,
      group: null,
      noteRefs: [],
      shoppingCategory: "pantry" as const,
    })),
  );
  const { client } = fakeClient(recipe);
  const result = await organiseCandidate(source, client);
  expect(
    result.recipe.ingredients.slice(1).map((line) => line.amountText),
  ).toEqual(["2 tbsp", "2 tbsp", "2 tbsp"]);
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
