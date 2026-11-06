import { INGREDIENT_NAMES } from "./ingredient-names";
import type { RecipeIngredientLine, RecipeStep } from "./recipes";

import {
  type StepIngredientMapping,
  type StepIngredientReference,
  MAXIMUM_STEP_REFERENCES as maximumStepReferences,
  MAXIMUM_RECIPE_REFERENCES as maximumRecipeReferences,
  MAXIMUM_CANDIDATE_LINES as maximumCandidateLines,
  validStepIngredientReferences,
  ingredientTextTokens as tokens,
} from "./step-ingredient-references";
import {
  hasExplicitIngredientAmountBefore,
  hasIngredientAmountBefore,
  hasFixedIngredientAmounts,
} from "./step-ingredient-amounts";
import {
  excludedIngredient,
  ingredientSentenceAt,
} from "./step-ingredient-language";
export type {
  StepIngredientMapping,
  StepIngredientReference,
} from "./step-ingredient-references";

type MappingRecipe = {
  ingredients: RecipeIngredientLine[];
  steps: RecipeStep[];
  notes?: { id: string; text: string }[];
  servingScaling?: "safe" | "source_only";
};

// Increment when matching/usage rules change, independently of the wire format.
const mappingRuleRevision = 4;

function key(text: string) {
  return tokens(text)
    .map((token) => token.text)
    .join(" ");
}

const equivalences = new Map<string, string[]>();
for (const ingredient of INGREDIENT_NAMES) {
  const forms = [
    ingredient.singular,
    ingredient.plural,
    ...(ingredient.aliases ?? []),
  ]
    .filter((form): form is string => Boolean(form))
    .map(key);
  for (const form of forms) equivalences.set(form, forms);
}

// These are reference words, not shopping equivalences. Competing forms still
// compete: "coriander" cannot pick between leaves, seeds and ground spice.
const referenceHeads = [
  "onion",
  "garlic",
  "coriander",
  "cumin",
  "paprika",
  "turmeric",
  "cinnamon",
  "ginger",
  "parsley",
  "basil",
  "thyme",
  "rosemary",
  "oregano",
  "mint",
  "dill",
  "chilli",
  "pepper",
  "oil",
  "butter",
  "flour",
  "sugar",
  "salt",
  "stock",
  "rice",
  "pasta",
  "chicken",
  "beef",
  "pork",
  "lamb",
  "tofu",
  "tomato",
  "potato",
  "carrot",
  "cabbage",
  "breadcrumbs",
  "sausage",
];

const referencePrefixes = new Set(
  "fresh dried ground whole red green yellow white black spring smoked brown bell extra virgin olive vegetable sunflower sesame rapeseed coconut unsalted salted plain self raising caster basmati jasmine arborio risotto sushi long short grain panko chicken beef fish turkey pork lamb skinless boneless large medium small flat leaf fine coarse sea".split(
    " ",
  ),
);
const referenceSuffixes = new Set(
  "leaves leaf seeds seed breast breasts thigh thighs leg legs quarter quarters fillet fillets mince cloves clove".split(
    " ",
  ),
);
const connectors = new Set(
  "the a an and or in of with to over into add stir mix fold scatter sprinkle fry sauté saute roast toast boil cook chop slice dice crush grate peel finely roughly thinly chopped diced sliced crushed grated peeled rinsed drained washed shredded beaten crumbled softened melted remaining reserved half quarter some all your prepared then return drain rinse wash toss heat combine beat whisk rub season warm pour place put spread top serve use using gently slowly immediately through together alongside little more extra rested sauced toasted warmed".split(
    " ",
  ),
);

function affirmativeNote(note = "") {
  return key(
    note.split(
      /\b(?:do not|don't|not|never|without|instead of|rather than)\b/i,
    )[0] ?? "",
  );
}

const preparationEvidenceWords = new Set(
  "fresh dried ground whole seeds seed leaves leaf powder paste finely roughly coarsely chopped minced grated crushed peeled sliced diced toasted".split(
    " ",
  ),
);
function notePreparationWords(note?: string) {
  const result: string[] = [];
  // Only the opening preparation phrase describes this ingredient. Words in
  // "serve with ground cumin" are not evidence that this line is ground.
  for (const word of affirmativeNote(note).split(" ")) {
    if (!preparationEvidenceWords.has(word)) break;
    result.push(word);
  }
  return result;
}

const conflictingForms: Record<string, readonly string[]> = {
  fresh: ["dried", "ground"],
  dried: ["fresh"],
  ground: ["fresh", "whole", "seeds", "seed"],
  whole: ["ground", "powder"],
  seeds: ["leaves", "ground", "powder"],
  seed: ["leaves", "ground", "powder"],
  leaves: ["seeds", "seed", "ground", "powder"],
  powder: ["fresh", "whole", "paste"],
};

function supportsModifier(line: RecipeIngredientLine, modifier: string) {
  const name = key(line.name).split(" ");
  if (name.includes(modifier)) return true;
  if (conflictingForms[modifier]?.some((word) => name.includes(word)))
    return false;
  return notePreparationWords(line.note).includes(modifier);
}

function ingredientForms(line: RecipeIngredientLine) {
  const name = key(line.name);
  const forms = new Set(equivalences.get(name) ?? [name]);
  const noteForm = affirmativeNote(line.note).match(
    /^(?:(?:finely|roughly) )?(fresh|dried|ground|whole)\b/,
  )?.[1];
  if (
    noteForm &&
    !name.split(" ").includes(noteForm) &&
    !conflictingForms[noteForm]?.some((word) => name.split(" ").includes(word))
  )
    forms.add(`${noteForm} ${name}`);
  if (name === "egg" || name === "eggs") {
    forms.add("whole egg");
    forms.add("whole eggs");
  }
  const unpackaged = name.replace(/ from a jar$/, "");
  forms.add(unpackaged);
  // Preparation occasionally lives in the name in older recipes.
  const unprepared = unpackaged.replace(
    /^(?:(?:finely|roughly|thinly) )?(?:chopped|diced|sliced|minced|crushed|grated|peeled|roasted) /,
    "",
  );
  for (const form of equivalences.get(unprepared) ?? [unprepared])
    forms.add(form);
  for (const head of referenceHeads) {
    const entry = INGREDIENT_NAMES.find(
      (ingredient) => ingredient.singular === head,
    );
    const headForms = [
      head,
      ...(entry?.plural ? [entry.plural] : []),
      ...(head === "sausage" ? ["sausages"] : []),
    ];
    const parts = unprepared.split(" ");
    if (
      headForms.some((form) => {
        const position = parts.indexOf(form);
        return (
          position >= 0 &&
          parts
            .slice(0, position)
            .every((part) => referencePrefixes.has(part)) &&
          parts.slice(position + 1).every((part) => referenceSuffixes.has(part))
        );
      })
    ) {
      for (const form of headForms) forms.add(form);
    }
  }
  if (/^(?:soft )?(?:light |dark )?brown sugar$/.test(name))
    forms.add("brown sugar");
  if (/^dried (?:green or brown|brown or green) lentils$/.test(name))
    forms.add("lentils");
  if (/^(?:lemon|lime|orange)$/.test(name)) {
    forms.add(`${name} juice`);
    forms.add(`${name} zest`);
  }
  // A common counted expression does not change garlic identity.
  if (forms.has("garlic")) {
    forms.add("clove of garlic");
    forms.add("cloves of garlic");
    forms.add("garlic clove");
    forms.add("garlic cloves");
  }
  return [...forms].filter(Boolean);
}

/** A compact invalidation key, not an authenticity/security boundary. */
function signature(value: unknown) {
  const text = JSON.stringify(value);
  let a = 2166136261;
  let b = 5381;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}

function recipeSignature(recipe: MappingRecipe) {
  return signature([
    mappingRuleRevision,
    recipe.ingredients.map(
      ({
        id,
        name,
        group,
        note,
        noteRefs,
        shoppingCategory,
        quantity,
        unit,
        amountText,
      }) => [
        id,
        name,
        group,
        note,
        noteRefs,
        shoppingCategory,
        quantity,
        unit,
        amountText,
      ],
    ),
    // Other steps affect whether this is a divided/repeated ingredient use.
    recipe.steps.map(({ id, text, group, noteRefs }) => [
      id,
      text,
      group,
      noteRefs,
    ]),
    recipe.notes?.map(({ id, text }) => [id, text]),
  ]);
}

function candidateIndex(recipe: MappingRecipe) {
  const linesByPhrase = new Map<string, RecipeIngredientLine[]>();
  const prefixes = new Set<string>();
  for (const line of recipe.ingredients) {
    for (const form of ingredientForms(line)) {
      const lines = linesByPhrase.get(form) ?? [];
      lines.push(line);
      linesByPhrase.set(form, lines);
      const words = form.split(" ");
      for (let end = 1; end <= words.length; end++)
        prefixes.add(words.slice(0, end).join(" "));
    }
  }
  return { linesByPhrase, prefixes };
}

function mapStep(
  candidates: ReturnType<typeof candidateIndex>,
  step: RecipeStep,
  signature: string,
  referencedNotes: string[],
  fixedIngredientNotes: boolean,
): StepIngredientMapping {
  const words = tokens(step.text);
  const references: StepIngredientReference[] = [];
  let truncated = false;
  let unresolvedComponent = false;
  let hasFixedAmounts =
    fixedIngredientNotes ||
    hasFixedIngredientAmounts(step.text) ||
    referencedNotes.some(hasFixedIngredientAmounts);
  for (let index = 0; index < words.length; index++) {
    let match: { endIndex: number; lines: RecipeIngredientLine[] } | undefined;
    let phrase = "";
    for (let endIndex = index; endIndex < words.length; endIndex++) {
      // Do not join names across commas, sentences, slashes or alternatives.
      if (
        endIndex > index &&
        !/^[\s'’\-\u2010-\u2015]+$/.test(
          step.text.slice(words[endIndex - 1]!.end, words[endIndex]!.start),
        )
      )
        break;
      phrase += `${phrase ? " " : ""}${words[endIndex]!.text}`;
      if (!candidates.prefixes.has(phrase)) break;
      const lines = candidates.linesByPhrase.get(phrase);
      if (lines) match = { endIndex, lines };
    }
    if (!match) continue;
    const start = words[index]!.start;
    const end = words[match.endIndex]!.end;
    const sentence = ingredientSentenceAt(step.text, start, end);
    let lines = match.lines;
    if (excludedIngredient(sentence.before, sentence.after)) {
      index = match.endIndex;
      continue;
    }
    // A shorter raw ingredient is not the prepared component named by a longer
    // phrase. A literal ingredient named "onion gravy" already matched in full.
    if (
      /^\s+(?:gravy|mixture|dressing|marinade|sauce)\b/i.test(sentence.after)
    ) {
      unresolvedComponent = true;
      index = match.endIndex;
      continue;
    }
    const alternative =
      /^\s+or\s+/i.test(sentence.after) ||
      /\bor\s+(?:(?:the|fresh|dried|ground|chopped|finely)\s+)*$/i.test(
        sentence.before,
      );
    const optional =
      /^\s+(?:(?:only\s+)?if\s+(?:using|desired|needed|available|you\s+(?:like|want))\b|\(optional\))/i.test(
        sentence.after,
      ) ||
      /\boptional\s+(?:the\s+)?$/i.test(sentence.before) ||
      /^\s*if (?:using|desired|you like)\s*,?\s*(?:add|use|stir in)\s+(?:the\s+)?$/i.test(
        sentence.before,
      );
    const prepared = /\b(?:cooked|reserved|prepared)\s+(?:the\s+)?$/i.test(
      sentence.before,
    );
    // An unmatched form word cannot be ignored by falling back to a shorter
    // name ("ground coriander" must not resolve to the only fresh coriander).
    const leading = sentence.before
      .match(/([\p{L}]+)\s*$/u)?.[1]
      ?.toLowerCase();
    const trailing = step.text
      .slice(end)
      .match(
        /^\s+(powder|paste|seeds?|leaves|juice|zest|stock|broth|sauce|butter|oil|flakes|rings|wedges)\b/i,
      )?.[1];
    const action =
      leading &&
      sentence.before.trim().toLowerCase() === leading &&
      /^(?:brown|blitz|check|pat|remove|return|transfer|reserve|arrange|tuck|substitute)$/.test(
        leading,
      );
    const remaining = /\b(?:remaining|rest of|remainder|leftover)\b/i.test(
      sentence.before,
    );
    const partial =
      /\b(?:half|third|quarter|some|divide|divided|portion|little|splash|drizzle|pinch)\b|[½¼¾⅓⅔]/i.test(
        sentence.text,
      ) ||
      /\d\s*(?:(?:g|kg|ml|l|tsp|tbsp|tablespoons?|teaspoons?|cups?|cloves?)\s+)?(?:of\s+(?:the\s+)?)?$/i.test(
        sentence.before,
      ) ||
      lines.some((line) =>
        /\b(?:divided|remaining|half|reserve)\b/i.test(line.note ?? ""),
      );
    const instructionAmount = hasExplicitIngredientAmountBefore(
      sentence.before,
      sentence.after,
    );
    const amountExpression = hasIngredientAmountBefore(sentence.before);
    hasFixedAmounts ||= instructionAmount;
    // Compare each candidate separately. Positive preparation evidence can
    // resolve an otherwise generic name; a negative note cannot endorse it.
    const compatible = lines.filter((line) =>
      [
        leading &&
        !connectors.has(leading) &&
        !action &&
        !prepared &&
        !amountExpression &&
        !(leading === "raw" && line.shoppingCategory === "meat_and_fish")
          ? leading
          : undefined,
        trailing,
      ].every((modifier) => !modifier || supportsModifier(line, modifier)),
    );
    const mismatchedForm = compatible.length === 0;
    if (compatible.length > 0) lines = compatible;
    // Ingredient form evidence takes precedence over component proximity.
    if (lines.length > 1 && step.group) {
      const component = lines.filter(
        (line) => line.group && key(line.group) === key(step.group!),
      );
      if (component.length === 1) lines = component;
    }
    if (
      lines.length > maximumCandidateLines ||
      references.length >= maximumStepReferences
    ) {
      truncated = true;
      index = match.endIndex;
      continue;
    }
    references.push({
      start,
      end,
      ingredientIds: lines.map((line) => line.id),
      optional,
      status:
        lines.length === 1 && !alternative && !mismatchedForm
          ? "resolved"
          : "ambiguous",
      usage: instructionAmount
        ? "instruction_amount"
        : remaining
          ? "remaining"
          : optional || alternative
            ? "optional"
            : partial || prepared
              ? "recipe_total"
              : "whole",
    });
    index = match.endIndex;
  }
  const indirect = Array.from(
    step.text.matchAll(
      /\b(?:spices|herbs|dry ingredients|wet ingredients|remaining ingredients|mixture|sauce|marinade)\b/gi,
    ),
  ).some(
    (mention) =>
      !references.some(
        (reference) =>
          reference.status === "resolved" &&
          reference.start <= mention.index &&
          reference.end >= mention.index + mention[0].length,
      ),
  );
  return {
    version: 1,
    inputSignature: `${signature}:${step.id}`,
    origin: "deterministic",
    hasFixedAmounts,
    status:
      truncated ||
      unresolvedComponent ||
      indirect ||
      references.some((reference) => reference.status === "ambiguous")
        ? "partial"
        : "complete",
    references,
  };
}

/** Run at content preparation or on the backend for unprocessed older recipes.
 * Never call from Cook rendering. Incoming mappings are rebuilt from content:
 * callers cannot forge accepted links by submitting metadata with recipe edits.
 */
export function enrichStepIngredients<T extends MappingRecipe>(recipe: T): T {
  const candidates = candidateIndex(recipe);
  const signature = recipeSignature(recipe);
  const notes = new Map(recipe.notes?.map((note) => [note.id, note.text]));
  const fixedIngredientNotes = recipe.ingredients.some(
    (line) =>
      hasFixedIngredientAmounts(line.note ?? "") ||
      (line.noteRefs ?? []).some((id) =>
        hasFixedIngredientAmounts(notes.get(id) ?? ""),
      ),
  );
  const mappedSteps = recipe.steps.map((step) => ({
    ...step,
    ingredientMapping: mapStep(
      candidates,
      step,
      signature,
      (step.noteRefs ?? []).flatMap((id) =>
        notes.has(id) ? [notes.get(id)!] : [],
      ),
      fixedIngredientNotes,
    ),
  }));
  let budget = maximumRecipeReferences;
  let truncated = false;
  const boundedSteps = mappedSteps.map((step) => {
    const mapping = step.ingredientMapping;
    const count = Math.min(mapping.references.length, budget);
    budget -= count;
    if (count === mapping.references.length) return step;
    truncated = true;
    return {
      ...step,
      ingredientMapping: {
        ...mapping,
        references: mapping.references.slice(0, count),
        status: "partial" as const,
      },
    };
  });
  const uses = new Map<string, Set<string>>();
  for (const step of boundedSteps) {
    for (const reference of step.ingredientMapping.references) {
      for (const id of reference.ingredientIds) {
        const stepIds = uses.get(id) ?? new Set<string>();
        stepIds.add(step.id);
        uses.set(id, stepIds);
      }
    }
  }
  const steps = boundedSteps.map((step) => ({
    ...step,
    ingredientMapping: {
      ...step.ingredientMapping,
      references: step.ingredientMapping.references.map((reference) =>
        reference.usage === "whole" &&
        (truncated ||
          reference.ingredientIds.some((id) => (uses.get(id)?.size ?? 0) > 1))
          ? { ...reference, usage: "recipe_total" as const }
          : reference,
      ),
    },
  }));
  return { ...recipe, steps };
}

/** Stored metadata is used only when its input and bounds still agree. */
export function hasCurrentIngredientMappings(recipe: MappingRecipe) {
  const ids = new Set(recipe.ingredients.map((line) => line.id));
  const signature = recipeSignature(recipe);
  let referenceCount = 0;
  return recipe.steps.every((step) => {
    const mapping = step.ingredientMapping;
    referenceCount += mapping?.references.length ?? 0;
    return (
      validStepIngredientReferences(mapping, step.text, ids) &&
      typeof mapping.hasFixedAmounts === "boolean" &&
      mapping.inputSignature === `${signature}:${step.id}` &&
      referenceCount <= maximumRecipeReferences &&
      (mapping.hasFixedAmounts ||
        mapping.references.every(
          (reference) => reference.usage !== "instruction_amount",
        ))
    );
  });
}

export function withStepIngredientMappings<T extends MappingRecipe>(
  recipe: T,
): T {
  return hasCurrentIngredientMappings(recipe)
    ? recipe
    : enrichStepIngredients(recipe);
}
