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
  steps: 100,
  stepId: 64,
  stepText: 2_000,
  servings: 1_000,
  minutes: 10_080,
  imageSrc: 240,
} as const;

export const PROTEIN_CATEGORIES = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "fish",
  "meat-free",
] as const;

export type ProteinCategory = (typeof PROTEIN_CATEGORIES)[number];

export const COST_BANDS = ["budget", "standard", "premium"] as const;

export type CostBand = (typeof COST_BANDS)[number];

export type RecipeIngredientLine = {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  note?: string;
};

export type RecipeStep = {
  id: string;
  text: string;
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
  imageSrc?: string;
};

export type RecipeSource =
  | { type: "manual" }
  | {
      type: "catalogue";
      catalogueMealId: string;
      catalogueVersion: number;
    };

export type CatalogueMeal = RecipeContent & {
  id: string;
  slug: string;
};

export type StandardCatalogue = {
  version: number;
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
  const imageSrc = optionalText(
    input.imageSrc,
    "Image path",
    RECIPE_LIMITS.imageSrc,
  );
  const costBand = optionalCostBand(input.costBand);

  return {
    title: requiredText(input.title, "Title", RECIPE_LIMITS.title),
    ...(description === undefined ? {} : { description }),
    ingredients: prepareIngredients(input.ingredients),
    steps: prepareSteps(input.steps),
    ...(servings === undefined ? {} : { servings }),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    ...(cookMinutes === undefined ? {} : { cookMinutes }),
    proteinCategory: requiredProteinCategory(input.proteinCategory),
    ...(costBand === undefined ? {} : { costBand }),
    ...(imageSrc === undefined ? {} : { imageSrc }),
  };
}

export function prepareStandardCatalogue(
  input: StandardCatalogue,
): StandardCatalogue {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RecipeValidationError(
      "Catalogue version must be a positive whole number.",
    );
  }

  boundedList(input.meals, "Catalogue meals", 1, RECIPE_LIMITS.catalogueMeals);
  uniqueIds(input.meals, "Catalogue meal");
  uniqueValues(
    input.meals.map((meal) => meal.slug),
    "Catalogue meal slugs",
  );

  return {
    version: input.version,
    meals: input.meals.map(({ id, slug, ...content }) => ({
      id: requiredText(id, "Catalogue meal ID", RECIPE_LIMITS.catalogueMealId),
      slug: requiredSlug(slug),
      ...prepareRecipeContent(content),
    })),
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
      ...(quantity === undefined ? {} : { quantity }),
      ...(unit === undefined ? {} : { unit }),
      ...(note === undefined ? {} : { note }),
    };
  });
}

function prepareSteps(steps: RecipeStep[]): RecipeStep[] {
  boundedList(steps, "Steps", 1, RECIPE_LIMITS.steps);
  uniqueIds(steps, "Step");

  return steps.map((step) => ({
    id: requiredText(step.id, "Step ID", RECIPE_LIMITS.stepId),
    text: requiredText(step.text, "Step text", RECIPE_LIMITS.stepText),
  }));
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
