import { expect, test } from "@playwright/test";
import * as cheerio from "cheerio";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  extractHtmlCandidate,
  holisticTriggerReasons,
  organiseCandidate,
} from "../../convex/lib/recipeImport/pipeline";
import { validateDownloadedRecipeImage } from "../../convex/lib/recipeImport/images";
import { ImportFailure } from "../../convex/lib/recipeImport/contracts";
import {
  assertPublicResolvedAddresses,
  assertPublicUrlShape,
} from "../../convex/lib/recipeImport/network";
import type { RecipeImportModelClient } from "../../convex/lib/recipeImport/models";
import { buildRecipeEvidence } from "../../convex/lib/recipeImport/source";

import {
  findRecipeSectionIndexes,
  inferImportedProteinCategory,
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
import {
  normaliseImportedDisplayAmount,
  normaliseImportedIngredientText,
  normaliseNumberedRecipeNotes,
  extractPrimaryInstructionMethod,
  selectFullInstructionSection,
} from "@/lib/domain/recipe-normalization";

const importerFixtures = resolve(process.cwd(), "tests/fixtures");

test("runs complete JSON-LD through the production deterministic pipeline", async () => {
  const html = readFileSync(
    resolve(importerFixtures, "complete-json-ld.html"),
    "utf8",
  );
  const candidate = extractHtmlCandidate(html, "https://recipes.example/post");
  expect(candidate.extractor).toBe("json_ld");
  expect(holisticTriggerReasons(candidate)).toEqual([]);

  const unexpectedModel: RecipeImportModelClient = {
    generate: async () => {
      throw new Error("The deterministic fast path called the model.");
    },
  };
  const outcome = await organiseCandidate(candidate, unexpectedModel);
  expect(outcome.recipe).toMatchObject({
    title: "Lemon chicken",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
  });
  expect(outcome.recipe.ingredients).toHaveLength(2);
  expect(outcome.recipe.steps).toHaveLength(2);
});

test("production extraction sends fragmented JSON-LD to holistic recovery", () => {
  const html = readFileSync(
    resolve(importerFixtures, "fragmented-json-ld.html"),
    "utf8",
  );
  const candidate = extractHtmlCandidate(html, "https://recipes.example/beans");
  expect(candidate.title).toBe("Herby beans");
  expect(candidate.ingredientLines).toEqual([
    "1 tin cannellini beans",
    "1 handful parsley",
  ]);
  expect(holisticTriggerReasons(candidate)).toContain("missing_core");
});

test("retries an invalid holistic contract once through the explicit repair stage", async () => {
  const html = readFileSync(
    resolve(importerFixtures, "fragmented-json-ld.html"),
    "utf8",
  );
  const candidate = extractHtmlCandidate(html, "https://recipes.example/beans");
  const pageEvidence = buildRecipeEvidence(candidate).find(
    (block) => block.kind === "page",
  );
  expect(pageEvidence).toBeDefined();
  const roles: string[] = [];
  const modelClient: RecipeImportModelClient = {
    generate: async (task) => {
      roles.push(task.role);
      if (roles.length === 1) {
        throw new ImportFailure("unsafe_result", "Invalid contract.");
      }
      return {
        isRecipe: true,
        title: "Herby beans",
        description: null,
        titleEvidenceIds: ["M1"],
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        proteinCategory: "meat-free",
        ingredients: [
          {
            sourceIds: ["I1"],
            name: "cannellini beans",
            quantity: "1",
            unit: "tin",
            note: null,
            amountText: "1 tin",
            group: null,
            noteRefs: [],
            shoppingCategory: "pantry",
          },
          {
            sourceIds: ["I2"],
            name: "parsley",
            quantity: "1",
            unit: "handful",
            note: null,
            amountText: "1 handful",
            group: null,
            noteRefs: [],
            shoppingCategory: "fruit_and_veg",
          },
        ],
        method: {
          steps: [
            {
              sourceIds: [pageEvidence!.id],
              text: "Drain the beans and toss with the parsley.",
              group: null,
              noteRefs: [],
            },
          ],
        },
        notes: [],
      } as Awaited<ReturnType<typeof task.schema.parseAsync>>;
    },
  };

  const outcome = await organiseCandidate(candidate, modelClient);
  expect(roles).toEqual(["holistic", "holistic_contract_repair"]);
  expect(outcome.recipe.title).toBe("Herby beans");
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

test("selects the first complete cooking method and splits collapsed steps", () => {
  const method = extractPrimaryInstructionMethod([
    {
      "@type": "HowToSection",
      name: "Stove Top",
      itemListElement: [
        {
          "@type": "HowToStep",
          text: "1. Brown the meatballs. 2. Simmer them in the sauce.",
        },
      ],
    },
    {
      "@type": "HowToSection",
      name: "Crockpot",
      itemListElement: [
        {
          "@type": "HowToStep",
          text: "1. Add everything to the crockpot. 2. Cook for 3–4 hours on low.",
        },
      ],
    },
  ]);

  expect(method).toEqual({
    label: "Stove Top",
    steps: [
      { text: "Brown the meatballs." },
      { text: "Simmer them in the sauce." },
    ],
  });
});

test("keeps the primary Half Baked Harvest method complete", () => {
  const html = readFileSync(
    `${process.cwd()}/tests/fixtures/halfbaked-meatballs.html`,
    "utf8",
  );
  const $ = cheerio.load(html);
  const recipe = JSON.parse(
    $('script[type="application/ld+json"]').first().text(),
  ) as {
    recipeYield: string;
    prepTime: string;
    cookTime: string;
    recipeIngredient: string[];
    recipeInstructions: unknown;
  };
  const method = extractPrimaryInstructionMethod(recipe.recipeInstructions);
  const italianSeasoning = normaliseImportedIngredientText(
    recipe.recipeIngredient[1]!,
  );

  expect(recipe).toMatchObject({
    recipeYield: "6 servings",
    prepTime: "PT20M",
    cookTime: "PT35M",
  });
  expect(recipe.recipeIngredient).toHaveLength(14);
  expect(italianSeasoning.sourceText).not.toContain("((");
  expect(method?.label).toBe("Stove Top");
  expect(method?.steps).toHaveLength(6);
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

test("recognises Guidelines as a method section for URL and pasted recipes", () => {
  const source = [
    "Lemon Dijon Chicken Meatballs",
    "Cooking notes:",
    "Use any plain hummus.",
    "Ingredients:",
    "1 tablespoon extra-virgin olive oil",
    "1 pound ground chicken",
    "2 tablespoons plain hummus",
    "Guidelines:",
    "Heat the olive oil in a large non-stick skillet over medium heat.",
    "Mix the chicken and hummus, then shape into meatballs.",
    "Cook for 3 minutes, turn, then cook for an additional 3 to 5 minutes.",
  ].join("\n");

  expect(findRecipeSectionIndexes(source.split("\n"))).toEqual({
    ingredientIndex: 3,
    methodIndex: 7,
  });
});

test("recognises common publisher alternatives for recipe section headings", () => {
  for (const heading of [
    "Method",
    "Instructions:",
    "Directions",
    "Preparation:",
    "Steps",
    "Procedure:",
    "How to make",
  ]) {
    expect(
      findRecipeSectionIndexes(["Ingredients", "1 onion", heading]),
    ).toEqual({ ingredientIndex: 0, methodIndex: 2 });
  }
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

test("keeps unfamiliar proteins importable as other", () => {
  expect(
    inferImportedProteinCategory("Pigeon with carrots\n2 whole pigeons"),
  ).toBe("other");
  expect(inferImportedProteinCategory("Roast turkey with herbs")).toBe(
    "chicken",
  );
});

test("recognises plural plant proteins as meat-free", () => {
  expect(inferImportedProteinCategory("Garlic beans with lemon")).toBe(
    "meat-free",
  );
  expect(inferImportedProteinCategory("Tomato and chickpeas")).toBe(
    "meat-free",
  );
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

test("selects the full RecipeTin method instead of its abbreviated summary", () => {
  const instructions = [
    {
      "@type": "HowToSection",
      name: "ABBREVIATED",
      itemListElement: [{ text: "Season then cook the chicken." }],
    },
    {
      "@type": "HowToSection",
      name: "FULL RECIPE",
      itemListElement: [
        { text: "Pound the chicken." },
        { text: "Season the chicken." },
        { text: "Cook the chicken." },
        { text: "Make the butter sauce." },
      ],
    },
  ];
  expect(selectFullInstructionSection(instructions)).toEqual([
    "Pound the chicken.",
    "Season the chicken.",
    "Cook the chicken.",
    "Make the butter sauce.",
  ]);
});

test("keeps referenced RecipeTin notes without importing adjacent lifestyle prose", () => {
  const notes = normaliseNumberedRecipeNotes([
    "To double the recipe, use two pans.",
    "1. Chicken – use evenly sized breasts.",
    "2. Flour – plain flour works best.",
    "3. Wine – use dry white wine.",
    "Flat bubbles is also great.",
    "4. Sauce amount – this is a quick pan sauce.",
    "Leftovers will keep for 3 days.",
    "Nutrition calculator is broken.",
  ]);
  expect(notes.map((note) => note.id)).toEqual([
    "note-1",
    "note-2",
    "note-3",
    "note-4",
  ]);
  expect(notes[2]?.text).toContain("Flat bubbles is also great.");
  expect(notes.map((note) => note.text).join(" ")).not.toContain("Leftovers");
  expect(notes.map((note) => note.text).join(" ")).not.toContain("Nutrition");
});
