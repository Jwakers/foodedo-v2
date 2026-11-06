import { expect, test } from "@playwright/test";
import {
  enrichStepIngredients,
  hasCurrentIngredientMappings,
} from "../../src/lib/domain/step-ingredients";
import { recipeServingModel } from "../../src/lib/domain/ingredient-scaling";
import type {
  RecipeContent,
  RecipeIngredientLine,
} from "../../src/lib/domain/recipes";

const line = (
  id: string,
  name: string,
  note?: string,
): RecipeIngredientLine => ({
  id,
  name,
  note,
  quantity: "2",
  shoppingCategory: "pantry",
});
function mapped(text: string, ingredients = [line("oil", "olive oil")]) {
  return enrichStepIngredients<RecipeContent>({
    title: "Review case",
    proteinCategory: "meat-free",
    servings: 2,
    servingScaling: "safe",
    ingredients,
    steps: [{ id: "step", text }],
  });
}

test("negative notes cannot endorse a conflicting ingredient form", () => {
  const result = mapped("Add ground coriander.", [
    line("fresh", "fresh coriander", "Do not use ground coriander"),
  ]);
  expect(result.steps[0]!.ingredientMapping!.references[0]!.status).toBe(
    "ambiguous",
  );
  const unrelated = mapped("Add ground coriander.", [
    line("coriander", "coriander", "serve with ground cumin"),
  ]);
  expect(unrelated.steps[0]!.ingredientMapping!.references[0]!.status).toBe(
    "ambiguous",
  );
});

test("affirmative preparation notes disambiguate qualified references", () => {
  const result = mapped("Add ground coriander.", [
    line("ground", "coriander", "ground"),
    line("fresh", "fresh coriander"),
  ]);
  expect(result.steps[0]!.ingredientMapping!.references).toMatchObject([
    { ingredientIds: ["ground"], status: "resolved" },
  ]);
});

for (const text of [
  "Add a teaspoon of oil.",
  "Add five tbsp oil.",
  "Add one and a half tbsp oil.",
  "Add a 400 g tin of tomatoes.",
  "Add 450 ml water, then stir in rice.",
]) {
  test(`fixed amount guard covers ${text}`, () => {
    const result = mapped(text, [
      line("oil", "olive oil"),
      line("tomato", "tomatoes"),
      line("rice", "jasmine rice"),
    ]);
    expect(recipeServingModel(result, 4).canScale).toBe(false);
  });
}

test("equipment capacities and relative portions do not block safe serving changes", () => {
  for (const text of [
    "Use a 2-litre pan. Add oil.",
    "Add half the oil.",
    "Add ½ of the oil.",
    "Add half of the remaining oil.",
  ]) {
    const result = mapped(text);
    expect(recipeServingModel(result, 4).canScale).toBe(true);
    if (text.startsWith("Add"))
      expect(result.steps[0]!.ingredientMapping!.references[0]!.status).toBe(
        "resolved",
      );
  }
});

test("reference caps cannot discard the fixed-quantity guard", () => {
  const input = mapped("Add oil. ".repeat(40) + "Add 1 tbsp oil.");
  expect(
    input.steps[0]!.ingredientMapping!.references.length,
  ).toBeLessThanOrEqual(32);
  expect(recipeServingModel(input, 4).canScale).toBe(false);
  input.steps = Array.from({ length: 12 }, (_, index) => ({
    id: `step-${index}`,
    text: index === 11 ? "Add 1 onion." : "Add oil. ".repeat(32),
  }));
  input.ingredients.push(line("onion", "onion"));
  const bounded = enrichStepIngredients(input);
  expect(bounded.steps.at(-1)!.ingredientMapping!.references).toEqual([]);
  expect(recipeServingModel(bounded, 4).canScale).toBe(false);
});

test("optional quantities retain optionality independently of amount usage", () => {
  expect(
    mapped("Add 1 tsp oil if desired.").steps[0]!.ingredientMapping!
      .references[0],
  ).toMatchObject({ usage: "instruction_amount", optional: true });
});

test("prepared components do not become raw ingredient additions", () => {
  expect(
    mapped("Add the onion gravy.", [line("onion", "onion")]).steps[0]!
      .ingredientMapping!.references,
  ).toEqual([]);
  expect(
    mapped("Add the onion gravy.", [line("gravy", "onion gravy")]).steps[0]!
      .ingredientMapping!.references,
  ).toMatchObject([{ ingredientIds: ["gravy"], status: "resolved" }]);
});

test("ordinary preparation language keeps clear identities linked", () => {
  for (const text of [
    "Stir through toasted cumin.",
    "Mix together cumin.",
    "Add a little more cumin.",
  ])
    expect(
      mapped(text, [line("cumin", "cumin")]).steps[0]!.ingredientMapping!
        .references[0],
    ).toMatchObject({ ingredientIds: ["cumin"], status: "resolved" });
});

test("exclusions cover modifiers and coordinated lists without swallowing later additions", () => {
  for (const text of [
    "Do not add any onion.",
    "Serve without adding onion.",
    "No need to add onion.",
    "Add no more onion.",
    "Omit onion and garlic.",
  ])
    expect(
      mapped(text, [line("onion", "onion"), line("garlic", "garlic")]).steps[0]!
        .ingredientMapping!.references,
    ).toEqual([]);
  const result = mapped("Omit onion, then add garlic.", [
    line("onion", "onion"),
    line("garlic", "garlic"),
  ]);
  expect(result.steps[0]!.ingredientMapping!.references).toMatchObject([
    { ingredientIds: ["garlic"], status: "resolved" },
  ]);
  expect(
    mapped("Use no more than 1 tsp oil.").steps[0]!.ingredientMapping!
      .references,
  ).toMatchObject([{ ingredientIds: ["oil"], status: "resolved" }]);
});

test("cache validation rejects duplicate IDs and multiple resolved candidates", () => {
  const input = mapped("Add oil.");
  input.steps[0]!.ingredientMapping!.references[0]!.ingredientIds.push("oil");
  expect(hasCurrentIngredientMappings(input)).toBe(false);
  const other = mapped("Add oil.", [
    line("oil", "olive oil"),
    line("onion", "onion"),
  ]);
  other.steps[0]!.ingredientMapping!.references[0]!.ingredientIds.push("onion");
  expect(hasCurrentIngredientMappings(other)).toBe(false);
});

test("referenced note amounts survive enrichment and invalidate after note edits", () => {
  const input = mapped("Cook the rice.", [line("rice", "rice")]);
  input.notes = [
    { id: "water", text: "Use 450 ml water." },
    { id: "unused", text: "Another dish uses 100 g flour." },
  ];
  input.steps[0]!.noteRefs = ["water"];
  const referenced = enrichStepIngredients(input);
  expect(recipeServingModel(referenced, 4).canScale).toBe(false);
  referenced.notes![0]!.text = "Use water as needed.";
  expect(hasCurrentIngredientMappings(referenced)).toBe(false);
  expect(
    recipeServingModel(enrichStepIngredients(referenced), 4).canScale,
  ).toBe(true);
});

test("Unicode normalization preserves exact original highlight positions", () => {
  const text = "🥣 Add crème fraîche.";
  const input = mapped(text, [line("cream", "crème fraîche")]);
  const reference = input.steps[0]!.ingredientMapping!.references[0]!;
  expect(reference.status).toBe("resolved");
  expect(text.slice(reference.start, reference.end)).toBe("crème fraîche");
  expect(hasCurrentIngredientMappings(input)).toBe(true);
  reference.start++;
  expect(hasCurrentIngredientMappings(input)).toBe(false);
  const emojiAdjacent = mapped("Add 🌶️chilli.", [line("chilli", "chilli")]);
  expect(emojiAdjacent.steps[0]!.ingredientMapping!.references).toMatchObject([
    { ingredientIds: ["chilli"], status: "resolved" },
  ]);
  expect(hasCurrentIngredientMappings(emojiAdjacent)).toBe(true);
});

test("negative equipment wording does not omit a later ingredient", () => {
  expect(
    mapped("Use a pan, not a bowl, with oil.").steps[0]!.ingredientMapping!
      .references[0],
  ).toMatchObject({ status: "resolved", ingredientIds: ["oil"] });
  expect(
    mapped("Use a pan without a lid with oil.").steps[0]!.ingredientMapping!
      .references[0],
  ).toMatchObject({ status: "resolved", ingredientIds: ["oil"] });
});

test("explicit amounts in ingredient notes use the same serving policy", () => {
  const input = mapped("Add the oil.", [
    line(
      "oil",
      "olive oil",
      "divided: 1 tbsp for the sauce and 1 tbsp for the garnish",
    ),
  ]);
  expect(recipeServingModel(input, 4).canScale).toBe(false);
  const other = mapped("Add the oil.");
  other.notes = [{ id: "split", text: "Use 1 tbsp for each component." }];
  other.ingredients[0]!.noteRefs = ["split"];
  expect(hasCurrentIngredientMappings(other)).toBe(false);
  expect(recipeServingModel(enrichStepIngredients(other), 4).canScale).toBe(
    false,
  );
});

test("process increments and portion sizes are not fixed recipe totals", () => {
  for (const text of [
    "Add oil a tablespoon at a time.",
    "Add 1 tbsp oil at a time.",
    "Add 1 tbsp oil per batch.",
    "Shape the mixture into 30 g balls.",
    "Make meatballs weighing 30 g each.",
    "Use 1 tbsp oil for every 200 g flour.",
  ]) {
    const result = mapped(text);
    expect(recipeServingModel(result, 4).canScale).toBe(true);
    if (text.startsWith("Add"))
      expect(result.steps[0]!.ingredientMapping!.references[0]!.status).toBe(
        "resolved",
      );
  }
  expect(
    recipeServingModel(mapped("Add 1 tbsp oil, then stir."), 4).canScale,
  ).toBe(false);
  for (const text of [
    "Add 1 tbsp oil and toss each piece.",
    "Add 1 tbsp each of oil and butter.",
  ])
    expect(recipeServingModel(mapped(text), 4).canScale).toBe(false);
});

test("literal names support apostrophes, Unicode hyphens and long authored phrases", () => {
  for (const [name, mention] of [
    ["bird's eye chilli", "bird’s eye chilli"],
    ["self-raising flour", "self–raising flour"],
    [
      "ready to use roasted red pepper and sun dried tomato cooking sauce",
      "ready to use roasted red pepper and sun dried tomato cooking sauce",
    ],
  ]) {
    const text = `Add the ${mention}.`;
    const input = mapped(text, [line("ingredient", name!)]);
    const reference = input.steps[0]!.ingredientMapping!.references[0]!;
    expect(reference).toMatchObject({
      status: "resolved",
      ingredientIds: ["ingredient"],
    });
    expect(text.slice(reference.start, reference.end)).toBe(mention);
    expect(hasCurrentIngredientMappings(input)).toBe(true);
  }
});

test("cooking conditions do not label a required ingredient optional", () => {
  const required = mapped("Add oil if the pan is dry.");
  expect(required.steps[0]!.ingredientMapping!.references[0]!.optional).toBe(
    false,
  );
  expect(
    mapped("Add oil if desired.").steps[0]!.ingredientMapping!.references[0]!
      .optional,
  ).toBe(true);
});

test("clear replacements reference the replacement rather than the omitted ingredient", () => {
  const ingredients = [line("sugar", "sugar"), line("honey", "honey")];
  for (const text of [
    "Replace sugar with honey.",
    "Substitute honey for sugar.",
    "Use honey instead of sugar.",
  ]) {
    expect(
      mapped(text, ingredients).steps[0]!.ingredientMapping!.references,
    ).toMatchObject([{ ingredientIds: ["honey"], status: "resolved" }]);
  }
});
