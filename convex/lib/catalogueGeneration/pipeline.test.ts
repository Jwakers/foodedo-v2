// @vitest-environment node
import { expect, test } from "vitest";
import {
  catalogueStatistics,
  nearestRecipes,
  timeBand,
  validateGeneratedRecipe,
  generationRunSummary,
} from "../../../src/lib/domain/catalogue-generation";
import {
  generateProposal,
  photographyPrompt,
  improveProposal,
} from "./pipeline";
import { recipeSchema, type GenerationClient } from "./models";
const recipe = {
  title: "Tomato and lentil pasta",
  description: "A satisfying weeknight meal.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  proteinCategory: "meat-free" as const,
  costBand: "budget" as const,
  ingredients: [
    {
      id: "lentils",
      name: "lentils",
      quantity: "400",
      unit: "g",
      note: null,
      shoppingCategory: "pantry" as const,
    },
    {
      id: "pasta",
      name: "pasta",
      quantity: "300",
      unit: "g",
      note: null,
      shoppingCategory: "pantry" as const,
    },
  ],
  steps: [
    { id: "one", text: "Boil the pasta for 10 minutes." },
    { id: "two", text: "Simmer the lentils and serve with the pasta." },
  ],
  preheat: null,
  notes: [],
};
const tags = {
  cuisines: ["italian"],
  mealOccasion: "dinner" as const,
  cookingMethods: ["simmered"],
  proteinSource: "lentils",
  carbBase: "pasta",
  flavourProfile: ["tomato"],
  complexity: "simple" as const,
  vegetarian: "yes" as const,
  vegan: "yes" as const,
};
function fakeClient(outputs: unknown[], roles: string[]): GenerationClient {
  return {
    async text(role, schema) {
      roles.push(role);
      if (!outputs.length) throw new Error("Unexpected extra call");
      return schema.parse(outputs.shift());
    },
    async image() {
      throw new Error("Recipe generation must not generate images");
    },
  };
}
const core = {
  ...recipe,
  ingredients: recipe.ingredients.map((line) => ({ ...line, note: undefined })),
  preheat: undefined,
};
test("deterministic distributions preserve unknowns and exact time boundaries", () => {
  expect([undefined, 0, 20, 21, 30, 31, 45, 46, 60, 61].map(timeBand)).toEqual([
    "unknown",
    "≤20",
    "≤20",
    "21–30",
    "21–30",
    "31–45",
    "31–45",
    "46–60",
    "46–60",
    ">60",
  ]);
  const stats = catalogueStatistics([
    { key: "one", content: core, tags },
    {
      key: "two",
      content: {
        ...core,
        prepMinutes: undefined,
        cookMinutes: undefined,
        costBand: undefined,
      },
    },
  ]);
  expect(stats.classified).toBe(1);
  expect(stats.totalTime).toEqual([
    { value: "21–30", count: 1 },
    { value: "unknown", count: 1 },
  ]);
  expect(stats.ingredients.find((row) => row.value === "lentils")?.count).toBe(
    2,
  );
  expect(stats.cost).toEqual([
    { value: "budget", count: 1 },
    { value: "unknown", count: 1 },
  ]);
});
test("detects renamed ingredient-similar meals and title duplicates", () => {
  const matches = nearestRecipes(core, [
    { key: "same", content: { ...core, title: "TOMATO & LENTIL PASTA" } },
  ]);
  expect(matches[0].overlap).toBe(1);
  expect(
    validateGeneratedRecipe(core, [
      {
        key: "pending",
        content: { ...core, title: "tomato and lentil pasta" },
      },
    ]).findings.some((f) => f.area === "duplicate"),
  ).toBe(true);
});
test("invalid, missing and implausible quantities block cookability", () => {
  for (const quantity of ["-1", "0", "Infinity", "900000", ""]) {
    expect(
      validateGeneratedRecipe({
        ...core,
        ingredients: [{ ...core.ingredients[0], quantity }],
      }).findings.some((f) => f.blocking),
    ).toBe(true);
  }
  expect(() => recipeSchema.parse({ ...recipe, servings: 0 })).toThrow();
});
test("successful generation makes three calls, one proposal and no image", async () => {
  const roles: string[] = [];
  const result = await generateProposal(
    fakeClient(
      [
        { concept: "Lentil main", rationale: "A useful meat-free meal" },
        { recipe, tags },
        { findings: [] },
      ],
      roles,
    ),
    [],
  );
  expect(roles).toEqual(["selection", "authoring", "culinary_review"]);
  expect(result.content.title).toBe(recipe.title);
  expect(result.content.servingScaling).toBe("safe");
});
test.each([
  "Missing side cooking instructions",
  "Unsafe chicken doneness",
  "Unrealistic timing",
  "Sauce quantities inconsistent",
])("culinary review repairs a blocking finding: %s", async (message) => {
  const roles: string[] = [];
  const result = await generateProposal(
    fakeClient(
      [
        { concept: "Lentil main", rationale: "Variety" },
        { recipe, tags },
        { findings: [{ area: "method", message, blocking: true }] },
        { recipe, tags, findings: [] },
      ],
      roles,
    ),
    [],
  );
  expect(result.findings).toEqual([]);
  expect(roles).toHaveLength(4);
});
test("unresolved issues fail without an unbounded repair loop", async () => {
  const issue = {
    area: "safety",
    message: "Unsafe instructions",
    blocking: true,
  };
  await expect(
    generateProposal(
      fakeClient(
        [
          { concept: "Main", rationale: "Variety" },
          { recipe, tags },
          { findings: [issue] },
          { recipe, tags, findings: [issue] },
        ],
        [],
      ),
      [],
    ),
  ).rejects.toThrow("did not pass culinary review");
});
test("regeneration retains concept and photography uses complete approved recipe", async () => {
  const roles: string[] = [];
  const result = await generateProposal(
    fakeClient([{ recipe, tags }, { findings: [] }], roles),
    [],
    {
      concept: "Keep this dish",
      rationale: "Improve technique",
      content: core,
      feedback: "Make clearer",
    },
  );
  expect(result.concept).toBe("Keep this dish");
  expect(roles).toEqual(["authoring", "culinary_review"]);
  expect(photographyPrompt(result.content)).toContain("lentils");
  expect(photographyPrompt(result.content)).toContain("16:9");
});

test("raw poultry requires a verified time/temperature check and required cooking cannot exceed total time", () => {
  const chicken = {
    ...core,
    ingredients: [{ ...core.ingredients[0], name: "raw chicken breast" }],
  };
  expect(
    validateGeneratedRecipe(chicken).findings.some((f) => f.area === "safety"),
  ).toBe(true);
  expect(
    validateGeneratedRecipe({
      ...chicken,
      steps: [
        ...chicken.steps,
        {
          id: "probe",
          text: "Use a clean probe in the thickest part to confirm 75°C for 30 seconds.",
        },
      ],
    }).findings.some((f) => f.area === "safety"),
  ).toBe(false);
  expect(
    validateGeneratedRecipe({
      ...core,
      steps: [{ id: "simmer", text: "Simmer for 45 minutes." }, core.steps[1]],
    }).findings.some((f) => f.area === "timing"),
  ).toBe(true);
});

test("an administrator request skips selection and catalogue context, retaining culinary review", async () => {
  const roles: string[] = [];
  const inputs: unknown[] = [];
  const client = fakeClient([{ recipe, tags }, { findings: [] }], roles);
  const text = client.text.bind(client);
  client.text = async (role, schema, system, input) => {
    inputs.push(input);
    return text(role, schema, system, input);
  };
  const result = await generateProposal(
    client,
    [{ key: "existing", content: { ...core, title: "A different meal" } }],
    undefined,
    "  Please make a rustic lentil pasta  ",
  );
  expect(roles).toEqual(["authoring", "culinary_review"]);
  expect(inputs[0]).toMatchObject({
    administratorRequest: "Please make a rustic lentil pasta",
  });
  expect(inputs[0]).not.toHaveProperty("existingTitles");
  expect(inputs[0]).not.toHaveProperty("nearestExistingMeals");
  expect(result.concept).toBe("Please make a rustic lentil pasta");
  expect(result.rationale).toContain("Requested by the administrator");
});
test("blank requests retain gap selection, while directed recipes still reject duplicates", async () => {
  const roles: string[] = [];
  await generateProposal(
    fakeClient(
      [
        { concept: "Pasta", rationale: "A gap" },
        { recipe, tags },
        { findings: [] },
      ],
      roles,
    ),
    [],
    undefined,
    "   ",
  );
  expect(roles[0]).toBe("selection");
  await expect(
    generateProposal(
      fakeClient(
        [{ recipe, tags }, { findings: [] }, { recipe, tags, findings: [] }],
        [],
      ),
      [{ key: "existing", content: core }],
      undefined,
      "Make lentil pasta",
    ),
  ).rejects.toThrow("same title");
});
test("run summary exposes total time and distinguishes partial/unknown cost", () => {
  expect(
    generationRunSummary({
      createdAt: 0,
      updatedAt: 152600,
      usage: [{ costUsd: 0.05 }, { costUsd: 0.15 }],
    }),
  ).toBe("2m 33s · US$0.2000");
  expect(
    generationRunSummary({
      createdAt: 0,
      updatedAt: 18000,
      usage: [{ costUsd: 0.01 }, {}],
    }),
  ).toContain("recorded (partial)");
  expect(
    generationRunSummary({ createdAt: 0, updatedAt: 18000, usage: [{}] }),
  ).toBe("18s · cost unavailable");
});

test("new photography style targets natural food textures while historical prompts stay reproducible", () => {
  const current = photographyPrompt(core, "natural-food-v3");
  expect(current).toContain("uneven browning");
  expect(current).toContain("natural white balance");
  expect(current).toContain("Never invent herbs");
  expect(current).not.toMatch(/crumbs|scatter|spill|mess/i);
  expect(photographyPrompt(core)).toBe(current);
  const previous = photographyPrompt(core, "natural-food-v2");
  expect(previous).toContain("a few natural crumbs");
  expect(
    previous.replace(
      "small surface cracks, a few natural crumbs and texture",
      "small surface cracks and texture",
    ),
  ).toBe(current);
  const historical = photographyPrompt(core, "natural-food-v1");
  expect(historical).toContain("Clean, realistic food photography");
  expect(historical).not.toContain("uneven browning");
});

test("catalogue improvement honours a focused request and independently reviews its result", async () => {
  const calls: Array<{ role: string; input: unknown }> = [];
  const richRecipe = {
    ...recipe,
    ingredients: recipe.ingredients.map((line) => ({
      ...line,
      group: null,
      noteRefs: [],
    })),
    steps: recipe.steps.map((step, index) => ({
      ...step,
      group: null,
      noteRefs: [],
      timerCues:
        index === 0
          ? [{ id: "pasta-timer", label: "Pasta", durationSeconds: 600 }]
          : [],
    })),
    notes: [],
  };
  const outputs = [
    { findings: [] },
    { recipe: richRecipe, tags, changeSummary: ["Adjusted the sauce method."] },
    { findings: [] },
  ];
  const client: GenerationClient = {
    async text(role, schema, _system, input) {
      calls.push({ role, input });
      return schema.parse(outputs.shift());
    },
    async image() {
      throw new Error("Unexpected image generation");
    },
  };
  const result = await improveProposal(
    client,
    core,
    tags,
    [],
    "Use a roux to thicken the sauce",
  );
  expect(calls.map((call) => call.role)).toEqual([
    "culinary_review",
    "authoring",
    "culinary_review",
  ]);
  expect(calls[1].input).toMatchObject({
    originalRecipe: core,
    administratorRequest: "Use a roux to thicken the sauce",
  });
  expect(calls[2].input).toMatchObject({
    administratorRequest: "Use a roux to thicken the sauce",
    claimedChanges: ["Adjusted the sauce method."],
  });
  expect(result.content.steps[0].timerCues).toEqual([
    { id: "pasta-timer", label: "Pasta", durationSeconds: 600 },
  ]);
  expect(result.changeSummary).toEqual(["Adjusted the sauce method."]);
});

test("an existing recipe without findings or a request is retained without an unnecessary rewrite", async () => {
  const roles: string[] = [];
  const result = await improveProposal(
    fakeClient([{ findings: [] }], roles),
    core,
    tags,
    [],
  );
  expect(roles).toEqual(["culinary_review"]);
  expect(result.content.title).toBe(core.title);
  expect(result.changeSummary).toEqual([]);
});

test("improvement has one bounded repair and fails when safety findings remain", async () => {
  const richRecipe = {
    ...recipe,
    ingredients: recipe.ingredients.map((line) => ({
      ...line,
      group: null,
      noteRefs: [],
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      group: null,
      noteRefs: [],
      timerCues: [],
    })),
    notes: [],
  };
  const blocking = {
    area: "safety",
    message: "Unsafe cooking instructions",
    blocking: true,
  };
  const roles: string[] = [];
  await expect(
    improveProposal(
      fakeClient(
        [
          { findings: [blocking] },
          { recipe: richRecipe, tags, changeSummary: ["Attempted correction"] },
          { findings: [blocking] },
          {
            recipe: richRecipe,
            tags,
            changeSummary: ["Attempted correction"],
            findings: [blocking],
          },
        ],
        roles,
      ),
      core,
      tags,
      [],
    ),
  ).rejects.toThrow("blocking findings");
  expect(roles).toEqual([
    "culinary_review",
    "authoring",
    "culinary_review",
    "targeted_repair",
  ]);
});

test("four pending recipes reach gap selection, authoring and culinary duplicate comparisons for the fifth", async () => {
  const titles = [
    "Lemon chickpea rice",
    "Smoky bean stew",
    "Mushroom barley bowl",
    "Paneer and spinach curry",
  ];
  const pending = titles.map((title, index) => ({
    key: `pending-${index}`,
    content: { ...core, title },
    ...(index ? { tags } : {}),
  }));
  const calls: Array<{ role: string; input: unknown }> = [];
  const outputs: unknown[] = [
    {
      concept: "A different pasta meal",
      rationale: "Offers a different format",
    },
    { recipe, tags },
    { findings: [] },
  ];
  const client: GenerationClient = {
    async text(role, schema, _system, input) {
      calls.push({ role, input });
      return schema.parse(outputs.shift());
    },
    async image() {
      throw new Error("No image call expected");
    },
  };
  await generateProposal(client, pending);
  expect(calls.map((call) => call.role)).toEqual([
    "selection",
    "authoring",
    "culinary_review",
  ]);
  expect(calls[0].input).toMatchObject({
    statistics: { total: 4, classified: 3 },
    catalogue: titles.map((title) => expect.objectContaining({ title })),
  });
  expect(calls[1].input).toMatchObject({
    existingTitles: titles,
    nearestExistingMeals: expect.arrayContaining(
      titles.map((title) => expect.objectContaining({ title })),
    ),
  });
  expect(calls[2].input).toMatchObject({
    nearest: expect.arrayContaining(
      pending.map((meal) =>
        expect.objectContaining({ key: meal.key, title: meal.content.title }),
      ),
    ),
  });
});
