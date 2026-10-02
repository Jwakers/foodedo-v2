export const RECIPE_LIMITS = {
  title: 160,
  description: 1_000,
  catalogueMeals: 1_000,
  catalogueMealId: 64,
  catalogueMealSlug: 160,
  ingredientLines: 100,
  ingredientLineId: 64,
  ingredientName: 160,
  ingredientQuantity: 80,
  ingredientUnit: 48,
  ingredientNote: 240,
  ingredientSourceText: 500,
  ingredientAmountText: 120,
  ingredientGroup: 120,
  steps: 100,
  stepId: 64,
  stepText: 2_000,
  stepGroup: 120,
  noteId: 64,
  noteLabel: 120,
  noteText: 2_000,
  timerCueId: 64,
  timerCueLabel: 160,
  servings: 1_000,
  minutes: 10_080,
} as const;

export const PROTEIN_CATEGORIES = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "fish",
  "meat-free",
  "other",
] as const;

export type ProteinCategory = (typeof PROTEIN_CATEGORIES)[number];

export const COST_BANDS = ["budget", "standard", "premium"] as const;

export type CostBand = (typeof COST_BANDS)[number];

export const SHOPPING_CATEGORIES = [
  "fruit_and_veg",
  "meat_and_fish",
  "dairy_and_eggs",
  "pantry",
  "bakery",
  "other",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export type RecipeIngredientLine = {
  id: string;
  name: string;
  shoppingCategory: ShoppingCategory;
  quantity?: string;
  unit?: string;
  note?: string;
  sourceText?: string;
  amountText?: string;
  group?: string;
  noteRefs?: string[];
};

export type RecipeStep = {
  id: string;
  text: string;
  group?: string;
  timerCues?: RecipeTimerCue[];
  sourceText?: string;
  noteRefs?: string[];
};

export type RecipeNote = {
  id: string;
  label?: string;
  text: string;
  sourceText?: string;
};

export type RecipePreheat = {
  appliance: "oven";
  temperatureC: number;
};

export type RecipeTimerCue = {
  id: string;
  label: string;
  durationSeconds: number;
};

export type RecipeMetadataOrigin = "published" | "derived" | "estimated";

export type RecipeMetadataProvenance = {
  servings?: RecipeMetadataOrigin;
  prepMinutes?: RecipeMetadataOrigin;
  cookMinutes?: RecipeMetadataOrigin;
};

export const RECIPE_NORMALIZATION_WARNING_AREAS = [
  "ingredients",
  "method",
  "notes",
  "metadata",
] as const;

export type RecipeNormalizationWarningArea =
  (typeof RECIPE_NORMALIZATION_WARNING_AREAS)[number];

export const RECIPE_NORMALIZATION_WARNING_CODES = [
  "ambiguous",
  "unresolved_reference",
  "source_conflict",
  "partial_coverage",
] as const;

export type RecipeNormalizationWarningCode =
  (typeof RECIPE_NORMALIZATION_WARNING_CODES)[number];

export type RecipeNormalizationWarning = {
  area: RecipeNormalizationWarningArea;
  code: RecipeNormalizationWarningCode;
  targetId?: string;
};

export type RecipeContent = {
  title: string;
  description?: string;
  ingredients: RecipeIngredientLine[];
  steps: RecipeStep[];
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  proteinCategory: ProteinCategory;
  costBand?: CostBand;
  preheat?: RecipePreheat;
  notes?: RecipeNote[];
  servingScaling?: "safe" | "source_only";
};

export type RecipeSource =
  | { type: "manual" }
  | {
      type: "catalogue";
      catalogueMealId: string;
      /** The immutable revision of this individual meal, not a catalogue release. */
      catalogueVersion: number;
    }
  | {
      type: "import";
      method: "url" | "text";
      importedAt: number;
      sourceUrl?: string;
      sourceName?: string;
      sourceAuthor?: string;
      normalizationVersion?: number;
      contentFingerprint?: string;
      metadataProvenance?: RecipeMetadataProvenance;
      normalizationWarnings?: RecipeNormalizationWarning[];
    };

export const RECIPE_REVIEW_ISSUES = [
  "servings",
  "prep_minutes",
  "cook_minutes",
] as const;

export type RecipeReviewIssue = (typeof RECIPE_REVIEW_ISSUES)[number];

export function getRecipeReviewIssues(
  recipe: Pick<RecipeContent, "servings" | "prepMinutes" | "cookMinutes"> & {
    source: RecipeSource;
  },
): RecipeReviewIssue[] {
  if (recipe.source.type !== "import") return [];

  const issues: RecipeReviewIssue[] = [];
  if (recipe.servings === undefined) issues.push("servings");
  // One trustworthy duration is useful enough to save without review. Some
  // recipes genuinely have no preparation or cooking phase, so do not make a
  // user invent the missing half of a total merely to finish an import.
  if (recipe.prepMinutes === undefined && recipe.cookMinutes === undefined) {
    issues.push("prep_minutes", "cook_minutes");
  }
  // Normalisation warnings remain available as private provenance for future
  // diagnostics, but they are not actionable enough to burden
  // the owner with a generic review state. Only concrete missing fields are
  // surfaced in the product.
  return issues;
}

/** Identifies one immutable revision of one catalogue meal. */
export type CatalogueMealReference = {
  catalogueMealId: string;
  catalogueVersion: number;
};

/** Stable key for maps and sets indexed by an exact catalogue meal revision. */
export function catalogueMealReferenceKey({
  catalogueMealId,
  catalogueVersion,
}: CatalogueMealReference) {
  return `${catalogueMealId}:${catalogueVersion}`;
}

export type CatalogueMeal = RecipeContent & {
  id: string;
  version: number;
  slug: string;
  position: number;
  imageSrc?: string;
};

export type CatalogueMealSummary = Omit<
  CatalogueMeal,
  "ingredients" | "steps" | "preheat"
>;

export type Catalogue = {
  meals: CatalogueMeal[];
};

export class RecipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

export function prepareRecipeContent(input: RecipeContent): RecipeContent {
  const description = optionalText(
    input.description,
    "Description",
    RECIPE_LIMITS.description,
  );
  const servings = optionalWholeNumber(
    input.servings,
    "Servings",
    1,
    RECIPE_LIMITS.servings,
  );
  const prepMinutes = optionalWholeNumber(
    input.prepMinutes,
    "Preparation time",
    0,
    RECIPE_LIMITS.minutes,
  );
  const cookMinutes = optionalWholeNumber(
    input.cookMinutes,
    "Cooking time",
    0,
    RECIPE_LIMITS.minutes,
  );
  const costBand = optionalCostBand(input.costBand);
  const preheat = optionalPreheat(input.preheat);
  const notes =
    input.notes === undefined ? undefined : prepareNotes(input.notes);
  const ingredients = prepareIngredients(input.ingredients);
  const steps = prepareSteps(input.steps);
  validateNoteReferences(ingredients, steps, notes);
  return {
    title: requiredText(input.title, "Title", RECIPE_LIMITS.title),
    ...(description === undefined ? {} : { description }),
    ingredients,
    steps,
    ...(servings === undefined ? {} : { servings }),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    ...(cookMinutes === undefined ? {} : { cookMinutes }),
    proteinCategory: requiredProteinCategory(input.proteinCategory),
    ...(costBand === undefined ? {} : { costBand }),
    ...(preheat === undefined ? {} : { preheat }),
    ...(notes === undefined ? {} : { notes }),
    ...(input.servingScaling === undefined
      ? {}
      : { servingScaling: requiredServingScaling(input.servingScaling) }),
  };
}

export function prepareCatalogue(input: Catalogue): Catalogue {
  boundedList(input.meals, "Catalogue meals", 1, RECIPE_LIMITS.catalogueMeals);
  uniqueIds(input.meals, "Catalogue meal");
  uniqueValues(
    input.meals.map((meal) => meal.slug),
    "Catalogue meal slugs",
  );
  uniqueValues(
    input.meals.map((meal) => String(meal.position)),
    "Catalogue meal positions",
  );

  return {
    meals: input.meals.map(
      ({ id, version, slug, position, imageSrc, ...content }, index) => {
        if (!Number.isInteger(version) || version < 1) {
          throw new RecipeValidationError(
            `Catalogue meal ${index + 1} version must be a positive whole number.`,
          );
        }
        const preparedImageSrc = optionalText(imageSrc, "Image URL", 2_000);
        return {
          id: requiredText(
            id,
            "Catalogue meal ID",
            RECIPE_LIMITS.catalogueMealId,
          ),
          version,
          slug: requiredSlug(slug),
          position: requiredWholeNumber(
            position,
            "Catalogue meal position",
            0,
            999,
          ),
          ...(preparedImageSrc === undefined
            ? {}
            : { imageSrc: preparedImageSrc }),
          ...prepareRecipeContent(content),
        };
      },
    ),
  };
}

function prepareIngredients(
  ingredients: RecipeIngredientLine[],
): RecipeIngredientLine[] {
  boundedList(ingredients, "Ingredients", 1, RECIPE_LIMITS.ingredientLines);
  uniqueIds(ingredients, "Ingredient");

  return ingredients.map((ingredient) => {
    const quantity = optionalText(
      ingredient.quantity,
      "Ingredient quantity",
      RECIPE_LIMITS.ingredientQuantity,
    );
    const unit = optionalText(
      ingredient.unit,
      "Ingredient unit",
      RECIPE_LIMITS.ingredientUnit,
    );
    const note = optionalText(
      ingredient.note,
      "Ingredient note",
      RECIPE_LIMITS.ingredientNote,
    );
    const sourceText = optionalText(
      ingredient.sourceText,
      "Ingredient source text",
      RECIPE_LIMITS.ingredientSourceText,
    );
    const amountText = optionalText(
      ingredient.amountText,
      "Ingredient amount text",
      RECIPE_LIMITS.ingredientAmountText,
    );
    const group = optionalText(
      ingredient.group,
      "Ingredient group",
      RECIPE_LIMITS.ingredientGroup,
    );

    return {
      id: requiredText(
        ingredient.id,
        "Ingredient ID",
        RECIPE_LIMITS.ingredientLineId,
      ),
      name: requiredText(
        ingredient.name,
        "Ingredient name",
        RECIPE_LIMITS.ingredientName,
      ),
      shoppingCategory: requiredShoppingCategory(ingredient.shoppingCategory),
      ...(quantity === undefined ? {} : { quantity }),
      ...(unit === undefined ? {} : { unit }),
      ...(note === undefined ? {} : { note }),
      ...(sourceText === undefined ? {} : { sourceText }),
      ...(amountText === undefined ? {} : { amountText }),
      ...(group === undefined ? {} : { group }),
      ...(ingredient.noteRefs === undefined
        ? {}
        : { noteRefs: prepareNoteRefs(ingredient.noteRefs) }),
    };
  });
}

function prepareSteps(steps: RecipeStep[]): RecipeStep[] {
  boundedList(steps, "Steps", 1, RECIPE_LIMITS.steps);
  uniqueIds(steps, "Step");

  const prepared = steps.map((step) => {
    const group = optionalText(
      step.group,
      "Step group",
      RECIPE_LIMITS.stepGroup,
    );
    const sourceText = optionalText(
      step.sourceText,
      "Step source text",
      RECIPE_LIMITS.stepText,
    );
    return {
      id: requiredText(step.id, "Step ID", RECIPE_LIMITS.stepId),
      text: requiredText(step.text, "Step text", RECIPE_LIMITS.stepText),
      ...(group === undefined ? {} : { group }),
      ...(step.timerCues === undefined
        ? {}
        : { timerCues: prepareTimerCues(step.timerCues) }),
      ...(sourceText === undefined ? {} : { sourceText }),
      ...(step.noteRefs === undefined
        ? {}
        : { noteRefs: prepareNoteRefs(step.noteRefs) }),
    };
  });
  uniqueValues(
    prepared.flatMap((step) => step.timerCues?.map((cue) => cue.id) ?? []),
    "Recipe timer cue IDs",
  );
  return prepared;
}

function prepareNotes(notes: RecipeNote[]) {
  boundedList(notes, "Recipe notes", 0, RECIPE_LIMITS.steps);
  uniqueIds(notes, "Recipe note");
  return notes.map((note) => {
    const label = optionalText(
      note.label,
      "Recipe note label",
      RECIPE_LIMITS.noteLabel,
    );
    const sourceText = optionalText(
      note.sourceText,
      "Recipe note source text",
      RECIPE_LIMITS.noteText,
    );
    return {
      id: requiredText(note.id, "Recipe note ID", RECIPE_LIMITS.noteId),
      ...(label === undefined ? {} : { label }),
      text: requiredText(note.text, "Recipe note text", RECIPE_LIMITS.noteText),
      ...(sourceText === undefined ? {} : { sourceText }),
    };
  });
}

function prepareNoteRefs(noteRefs: string[]) {
  boundedList(noteRefs, "Recipe note references", 0, RECIPE_LIMITS.steps);
  return noteRefs.map((reference) =>
    requiredText(reference, "Recipe note reference", RECIPE_LIMITS.noteId),
  );
}

function validateNoteReferences(
  ingredients: RecipeIngredientLine[],
  steps: RecipeStep[],
  notes: RecipeNote[] | undefined,
) {
  const noteIds = new Set(notes?.map((note) => note.id) ?? []);
  const references = [
    ...ingredients.flatMap((ingredient) => ingredient.noteRefs ?? []),
    ...steps.flatMap((step) => step.noteRefs ?? []),
  ];
  const unresolved = references.find((reference) => !noteIds.has(reference));
  if (unresolved !== undefined) {
    throw new RecipeValidationError(
      `Recipe note reference ${unresolved} does not exist.`,
    );
  }
}

function requiredServingScaling(value: "safe" | "source_only") {
  if (value !== "safe" && value !== "source_only") {
    throw new RecipeValidationError("Serving scaling mode is invalid.");
  }
  return value;
}

function prepareTimerCues(timerCues: RecipeTimerCue[]) {
  boundedList(timerCues, "Timer cues", 0, RECIPE_LIMITS.steps);
  uniqueIds(timerCues, "Timer cue");
  return timerCues.map((cue) => ({
    id: requiredText(cue.id, "Timer cue ID", RECIPE_LIMITS.timerCueId),
    label: requiredText(
      cue.label,
      "Timer cue label",
      RECIPE_LIMITS.timerCueLabel,
    ),
    durationSeconds: requiredPositiveWholeNumber(
      cue.durationSeconds,
      "Timer duration",
      86_400,
    ),
  }));
}

function optionalPreheat(value: RecipePreheat | undefined) {
  if (value === undefined) return undefined;
  if (value.appliance !== "oven") {
    throw new RecipeValidationError("Preheat appliance must be oven.");
  }
  return {
    appliance: "oven" as const,
    temperatureC: requiredPositiveWholeNumber(
      value.temperatureC,
      "Preheat temperature",
      300,
    ),
  };
}

function requiredText(value: string, label: string, maximum: number) {
  const normalised = value.trim();
  if (normalised.length === 0) {
    throw new RecipeValidationError(`${label} is required.`);
  }
  if (normalised.length > maximum) {
    throw new RecipeValidationError(
      `${label} must be ${maximum} characters or fewer.`,
    );
  }
  return normalised;
}

function optionalText(
  value: string | undefined,
  label: string,
  maximum: number,
) {
  if (value === undefined) return undefined;
  const normalised = value.trim();
  if (normalised.length === 0) return undefined;
  if (normalised.length > maximum) {
    throw new RecipeValidationError(
      `${label} must be ${maximum} characters or fewer.`,
    );
  }
  return normalised;
}

function optionalWholeNumber(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RecipeValidationError(
      `${label} must be a whole number between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function requiredPositiveWholeNumber(
  value: number,
  label: string,
  maximum: number,
) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RecipeValidationError(
      `${label} must be a whole number between 1 and ${maximum}.`,
    );
  }
  return value;
}

function requiredWholeNumber(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RecipeValidationError(
      `${label} must be a whole number between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function requiredSlug(value: string) {
  const slug = requiredText(
    value,
    "Catalogue meal slug",
    RECIPE_LIMITS.catalogueMealSlug,
  );
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new RecipeValidationError(
      "Catalogue meal slug must contain only lowercase letters, numbers, and single hyphens.",
    );
  }
  return slug;
}

function requiredProteinCategory(value: ProteinCategory): ProteinCategory {
  if (!PROTEIN_CATEGORIES.includes(value)) {
    throw new RecipeValidationError(
      "Protein category must be chicken, beef, pork, lamb, fish, or meat-free.",
    );
  }
  return value;
}

function requiredShoppingCategory(value: ShoppingCategory): ShoppingCategory {
  if (!SHOPPING_CATEGORIES.includes(value)) {
    throw new RecipeValidationError(
      "Shopping category must be fruit and veg, meat and fish, dairy and eggs, pantry, bakery, or other.",
    );
  }
  return value;
}

function optionalCostBand(value: CostBand | undefined): CostBand | undefined {
  if (value === undefined) return undefined;
  if (!COST_BANDS.includes(value)) {
    throw new RecipeValidationError(
      "Cost band must be budget, standard, or premium.",
    );
  }
  return value;
}

function boundedList(
  values: unknown[],
  label: string,
  minimum: number,
  maximum: number,
) {
  if (values.length < minimum || values.length > maximum) {
    throw new RecipeValidationError(
      `${label} must contain between ${minimum} and ${maximum} items.`,
    );
  }
}

function uniqueIds(values: Array<{ id: string }>, label: string) {
  uniqueValues(
    values.map((value) => value.id.trim()),
    `${label} IDs`,
  );
}

function uniqueValues(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new RecipeValidationError(`${label} must be unique.`);
  }
}
