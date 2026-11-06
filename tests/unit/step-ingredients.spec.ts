import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { recipeServingModel } from "../../src/lib/domain/ingredient-scaling";
import {
  enrichStepIngredients,
  hasCurrentIngredientMappings,
  withStepIngredientMappings,
} from "../../src/lib/domain/step-ingredients";
import {
  prepareRecipeContent,
  type RecipeContent,
  type RecipeIngredientLine,
} from "../../src/lib/domain/recipes";
import {
  culinaryContentChanged,
  recipeFingerprint,
} from "../../src/lib/domain/catalogue-generation";

function ingredient(
  id: string,
  name: string,
  other: Partial<RecipeIngredientLine> = {},
): RecipeIngredientLine {
  return { id, name, shoppingCategory: "pantry", ...other };
}
function recipe(
  text: string,
  ingredients = [ingredient("onion", "onion")],
): RecipeContent {
  return {
    title: "Test dinner",
    proteinCategory: "meat-free",
    servings: 2,
    ingredients,
    steps: [{ id: "step", text }],
  };
}
function mentions(input: RecipeContent) {
  const result = enrichStepIngredients(input);
  return result.steps[0]!.ingredientMapping!.references.map((reference) => ({
    text: result.steps[0]!.text.slice(reference.start, reference.end),
    ids: reference.ingredientIds,
    status: reference.status,
    usage: reference.usage,
  }));
}

// Independently specified expectations: do not generate expected links with the
// matcher. These are the initial acceptance corpus, not an accuracy estimate.
const cases: {
  name: string;
  input: RecipeContent;
  expected: ReturnType<typeof mentions>;
}[] = [
  {
    name: "case, plural and Unicode offsets",
    input: recipe("🧅 Add the ONIONS."),
    expected: [
      { text: "ONIONS", ids: ["onion"], status: "resolved", usage: "whole" },
    ],
  },
  {
    name: "preparation in older ingredient names",
    input: recipe("Fry the onion.", [
      ingredient("onion", "finely chopped onions"),
    ]),
    expected: [
      { text: "onion", ids: ["onion"], status: "resolved", usage: "whole" },
    ],
  },
  {
    name: "counted garlic expression",
    input: recipe("Crush the cloves of garlic.", [
      ingredient("garlic", "garlic"),
    ]),
    expected: [
      {
        text: "cloves of garlic",
        ids: ["garlic"],
        status: "resolved",
        usage: "whole",
      },
    ],
  },
  {
    name: "reviewed fresh coriander alias",
    input: recipe("Scatter over cilantro.", [
      ingredient("fresh", "fresh coriander"),
    ]),
    expected: [
      { text: "cilantro", ids: ["fresh"], status: "resolved", usage: "whole" },
    ],
  },
  {
    name: "specific spice wins over shorter mentions",
    input: recipe("Add ground coriander.", [
      ingredient("fresh", "fresh coriander"),
      ingredient("ground", "ground coriander"),
    ]),
    expected: [
      {
        text: "ground coriander",
        ids: ["ground"],
        status: "resolved",
        usage: "whole",
      },
    ],
  },
  {
    name: "bare coriander has competing forms",
    input: recipe("Add coriander.", [
      ingredient("fresh", "fresh coriander"),
      ingredient("ground", "ground coriander"),
    ]),
    expected: [
      {
        text: "coriander",
        ids: ["fresh", "ground"],
        status: "ambiguous",
        usage: "whole",
      },
    ],
  },
  {
    name: "unsupported ground form cannot select fresh leaves",
    input: recipe("Add ground coriander.", [
      ingredient("fresh", "fresh coriander"),
    ]),
    expected: [
      {
        text: "coriander",
        ids: ["fresh"],
        status: "ambiguous",
        usage: "whole",
      },
    ],
  },
  {
    name: "unsupported seed form cannot select ground spice",
    input: recipe("Toast coriander seeds.", [
      ingredient("ground", "ground coriander"),
    ]),
    expected: [
      {
        text: "coriander",
        ids: ["ground"],
        status: "ambiguous",
        usage: "whole",
      },
    ],
  },
  {
    name: "onion alias cannot change colour",
    input: recipe("Add brown onions.", [ingredient("red", "red onion")]),
    expected: [
      { text: "onions", ids: ["red"], status: "ambiguous", usage: "whole" },
    ],
  },
  {
    name: "stock is not chicken",
    input: recipe("Add the chicken.", [ingredient("stock", "chicken stock")]),
    expected: [],
  },
  {
    name: "compound butter is not plain butter",
    input: recipe("Add butter.", [ingredient("peanut", "peanut butter")]),
    expected: [],
  },
  {
    name: "words are not substrings",
    input: recipe("Roast the cauliflower.", [ingredient("flour", "flour")]),
    expected: [],
  },
  {
    name: "unknown nouns remain valid",
    input: recipe("Stir in gochujang.", [ingredient("paste", "gochujang")]),
    expected: [
      { text: "gochujang", ids: ["paste"], status: "resolved", usage: "whole" },
    ],
  },
  {
    name: "remaining amount is not the total",
    input: recipe("Add the remaining oil.", [ingredient("oil", "olive oil")]),
    expected: [
      { text: "oil", ids: ["oil"], status: "resolved", usage: "remaining" },
    ],
  },
  {
    name: "half is not the whole line",
    input: recipe("Add half the oil.", [ingredient("oil", "olive oil")]),
    expected: [
      { text: "oil", ids: ["oil"], status: "resolved", usage: "recipe_total" },
    ],
  },
  {
    name: "an explicit step amount is not the whole line",
    input: recipe("Add 1 tbsp of the oil.", [ingredient("oil", "olive oil")]),
    expected: [
      {
        text: "oil",
        ids: ["oil"],
        status: "resolved",
        usage: "instruction_amount",
      },
    ],
  },
  {
    name: "cooking duration does not imply a partial amount",
    input: recipe("Fry onion for 10 minutes."),
    expected: [
      { text: "onion", ids: ["onion"], status: "resolved", usage: "whole" },
    ],
  },
  {
    name: "exclusions are not additions",
    input: recipe("Serve without onion."),
    expected: [],
  },
  {
    name: "optional use does not make ingredient identity uncertain",
    input: recipe("Add onion if you like."),
    expected: [
      { text: "onion", ids: ["onion"], status: "resolved", usage: "optional" },
    ],
  },
  {
    name: "prepared ingredients are not another full addition",
    input: recipe("Return the cooked onion to the pan."),
    expected: [
      {
        text: "onion",
        ids: ["onion"],
        status: "resolved",
        usage: "recipe_total",
      },
    ],
  },
];
for (const example of cases)
  test(example.name, () =>
    expect(mentions(example.input)).toEqual(example.expected),
  );

test("component labels resolve duplicate lines, without merging quantities", () => {
  const input = recipe("Add the oil.", [
    ingredient("sauce-oil", "olive oil", { group: "Sauce" }),
    ingredient("marinade-oil", "olive oil", { group: "Marinade" }),
  ]);
  expect(mentions(input)[0]).toMatchObject({
    ids: ["sauce-oil", "marinade-oil"],
    status: "ambiguous",
  });
  input.steps[0]!.group = "marinade";
  expect(mentions(input)[0]).toMatchObject({
    ids: ["marinade-oil"],
    status: "resolved",
  });
});

test("real catalogue reference forms keep rice, cabbage, stock and breadcrumbs visible", () => {
  const input = recipe(
    "Put the rinsed rice in a saucepan. Put the shredded cabbage in a bowl. Add stock, then breadcrumbs.",
    [
      ingredient("rice", "jasmine rice", { note: "rinsed" }),
      ingredient("cabbage", "white cabbage", { note: "finely shredded" }),
      ingredient("stock", "chicken stock"),
      ingredient("crumbs", "panko breadcrumbs"),
    ],
  );
  expect(
    mentions(input).map(({ text, ids, status }) => ({ text, ids, status })),
  ).toEqual([
    { text: "rice", ids: ["rice"], status: "resolved" },
    { text: "cabbage", ids: ["cabbage"], status: "resolved" },
    { text: "stock", ids: ["stock"], status: "resolved" },
    { text: "breadcrumbs", ids: ["crumbs"], status: "resolved" },
  ]);
});

test("an earlier use makes a repeated line a recipe total", () => {
  const input = recipe("Add oil.", [ingredient("oil", "olive oil")]);
  input.steps.push({ id: "later", text: "Drizzle oil over the vegetables." });
  const result = enrichStepIngredients(input);
  expect(
    result.steps.map((step) => step.ingredientMapping!.references[0]!.usage),
  ).toEqual(["recipe_total", "recipe_total"]);
});

test("the real linguine fixture preserves the remaining-oil distinction", () => {
  const source = readFileSync(
    "tests/fixtures/pasted-leek-linguine.txt",
    "utf8",
  );
  const step = source.split("\n").find((line) => line.startsWith("2."))!;
  expect(
    mentions(
      recipe(step, [
        ingredient("oil", "olive oil", { quantity: "2", unit: "tbsp" }),
      ]),
    )[0],
  ).toMatchObject({ ids: ["oil"], usage: "remaining" });
});

test("collective and prepared component references are explicitly unresolved", () => {
  for (const text of [
    "Add the spices.",
    "Stir in the sauce made earlier.",
    "Fold in the mixture.",
  ]) {
    const mapping = enrichStepIngredients(recipe(text)).steps[0]!
      .ingredientMapping!;
    expect(mapping.status).toBe("partial");
    expect(mapping.references).toEqual([]);
  }
  expect(
    enrichStepIngredients(
      recipe("Add soy sauce.", [ingredient("soy", "soy sauce")]),
    ).steps[0]!.ingredientMapping!.status,
  ).toBe("complete");
  expect(
    enrichStepIngredients(recipe("Leave to rest.")).steps[0]!.ingredientMapping,
  ).toMatchObject({ status: "complete", references: [] });
});

test("content preparation regenerates stale or forged metadata and retains prep notes", () => {
  const input = prepareRecipeContent(
    recipe("Add onion.", [
      ingredient("onion", "onion", { quantity: "2", note: "finely chopped" }),
    ]),
  );
  expect(hasCurrentIngredientMappings(input)).toBe(true);
  expect(withStepIngredientMappings(input)).toBe(input);
  input.ingredients[0]!.note = "sliced";
  expect(hasCurrentIngredientMappings(input)).toBe(false);
  const updated = prepareRecipeContent(input);
  expect(updated.ingredients[0]!.note).toBe("sliced");
  expect(hasCurrentIngredientMappings(updated)).toBe(true);
  updated.steps[0]!.ingredientMapping!.references[0]!.ingredientIds = [
    "missing",
  ];
  expect(hasCurrentIngredientMappings(updated)).toBe(false);
  expect(
    prepareRecipeContent(updated).steps[0]!.ingredientMapping!.references[0]!
      .ingredientIds,
  ).toEqual(["onion"]);
  updated.steps[0]!.text = "Rest.";
  expect(
    withStepIngredientMappings(updated).steps[0]!.ingredientMapping!.references,
  ).toEqual([]);
});

test("enrichment leaves authored content and catalogue approval fingerprints intact", async () => {
  const input = recipe("Add onion.");
  const before = JSON.stringify(input);
  const enriched = enrichStepIngredients(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(culinaryContentChanged(input, enriched)).toBe(false);
  expect(await recipeFingerprint(input)).toBe(
    await recipeFingerprint(enriched),
  );
});

test("enrichment accepts frozen mappings and keeps repeated results independent", () => {
  const input = recipe("Chop onion.");
  input.steps.push({ id: "fry", text: "Fry onion." });
  const original = enrichStepIngredients(input);
  function freeze(value: unknown) {
    if (value === null || typeof value !== "object") return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  freeze(original);
  const before = JSON.stringify(original);
  const first = enrichStepIngredients(original);
  const second = enrichStepIngredients(original);
  expect(first).toEqual(original);
  expect(second).toEqual(original);
  expect(first.steps[0]!.ingredientMapping!.references[0]!.usage).toBe(
    "recipe_total",
  );
  first.steps[0]!.ingredientMapping!.references[0]!.ingredientIds.push("other");
  first.steps[1]!.ingredientMapping!.references.length = 0;
  expect(JSON.stringify(original)).toBe(before);
  expect(second).toEqual(original);
});

test("serving scaling safely handles steps without ingredient mappings", () => {
  const input = recipe("Add onion.", [
    ingredient("onion", "onion", { quantity: "1" }),
  ]);
  const model = recipeServingModel(input, 4);
  expect(model.canScale).toBe(true);
  expect(model.ingredients[0]!.quantity).toBe("2");
});

test("fixed amounts in unchanged instructions retain authored servings across ingredient surfaces", () => {
  for (const text of [
    "Add 1 tbsp of the oil.",
    "Add 2 finely chopped onions.",
  ]) {
    const input = recipe(text, [
      ingredient("oil", "olive oil", { quantity: "4", unit: "tbsp" }),
      ingredient("onion", "onions", { quantity: "3" }),
    ]);
    input.servingScaling = "safe";
    const prepared = prepareRecipeContent(input);
    const model = recipeServingModel(prepared, 4);
    expect(model.canScale).toBe(false);
    expect(model.cookingServings).toBe(2);
    expect(model.ingredients).toEqual(prepared.ingredients);
    expect(prepared.servingScaling).toBe("safe"); // Enrichment never rewrites authored content.
  }
});

test("bounded enrichment cannot explode on repetitive or highly ambiguous valid input", () => {
  const input = recipe("Add onion. ".repeat(100));
  input.steps = Array.from({ length: 100 }, (_, index) => ({
    id: `step-${index}`,
    text: input.steps[0]!.text,
  }));
  const enriched = enrichStepIngredients(input);
  expect(
    enriched.steps.reduce(
      (sum, step) => sum + step.ingredientMapping!.references.length,
      0,
    ),
  ).toBeLessThanOrEqual(256);
  expect(enriched.steps.at(-1)!.ingredientMapping!.status).toBe("partial");
  expect(hasCurrentIngredientMappings(enriched)).toBe(true);
  const ambiguous = enrichStepIngredients(
    recipe(
      "Add onion.",
      Array.from({ length: 100 }, (_, index) =>
        ingredient(`onion-${index}`, "onion"),
      ),
    ),
  );
  expect(ambiguous.steps[0]!.ingredientMapping).toMatchObject({
    status: "partial",
    references: [],
  });
});

test("equipment alternatives and safety instructions do not make named ingredients ambiguous", () => {
  for (const text of [
    "In a food processor or blender, blitz the onion.",
    "Cook the onion, stirring once or twice so it does not catch.",
    "If your pan is small, brown the onion in batches.",
    "Check the onion is thoroughly cooked.",
  ])
    expect(mentions(recipe(text))[0]).toMatchObject({
      ids: ["onion"],
      status: "resolved",
    });
  expect(
    mentions(
      recipe("Add onion or garlic.", [
        ingredient("onion", "onion"),
        ingredient("garlic", "garlic"),
      ]),
    ).every((reference) => reference.status === "ambiguous"),
  ).toBe(true);
  expect(
    mentions(
      recipe("Use onion instead of garlic.", [
        ingredient("onion", "onion"),
        ingredient("garlic", "garlic"),
      ]),
    ).map((reference) => reference.ids),
  ).toEqual([["onion"]]);
});

test("peri-peri step five resolves all named ingredient lines despite processor-or-blender wording", () => {
  const examples = JSON.parse(
    readFileSync("tests/fixtures/cook-ingredient-references.json", "utf8"),
  ) as RecipeContent[];
  const peri = examples.find((example) =>
    example.title.startsWith("Peri-Peri"),
  )!;
  const result = enrichStepIngredients(peri).steps[4]!.ingredientMapping!;
  expect(
    result.references.every((reference) => reference.status === "resolved"),
  ).toBe(true);
  expect(
    [
      ...new Set(
        result.references.flatMap((reference) => reference.ingredientIds),
      ),
    ].sort(),
  ).toEqual(
    [
      "ing_roasted_red_peppers",
      "ing_red_chillies",
      "ing_garlic",
      "ing_lemon",
      "ing_red_wine_vinegar",
      "ing_smoked_paprika",
      "ing_dried_oregano",
      "ing_soft_brown_sugar",
      "ing_olive_oil",
      "ing_sea_salt",
      "ing_black_pepper",
    ].sort(),
  );
});

test("casserole step two includes the sausages and later safety wording leaves lentils linked", () => {
  const examples = JSON.parse(
    readFileSync("tests/fixtures/cook-ingredient-references.json", "utf8"),
  ) as RecipeContent[];
  const casserole = examples.find((example) =>
    example.title.startsWith("Sausage"),
  )!;
  const result = enrichStepIngredients(casserole);
  expect(
    result.steps[1]!.ingredientMapping!.references.map(
      ({ ingredientIds, status }) => ({ ingredientIds, status }),
    ),
  ).toEqual([
    { ingredientIds: ["ing_oil"], status: "resolved" },
    { ingredientIds: ["ing_sausages"], status: "resolved" },
  ]);
  expect(result.steps[4]!.ingredientMapping!.references).toMatchObject([
    { ingredientIds: ["ing_lentils"], status: "resolved" },
  ]);
});
