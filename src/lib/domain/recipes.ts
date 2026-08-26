export const RECIPE_LIMITS = {
  title: 160,
  description: 1_000,
  catalogueMeals: 1_000,
  catalogueMealId: 64,
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
} as const;

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

  return {
    title: requiredText(input.title, "Title", RECIPE_LIMITS.title),
    ...(description === undefined ? {} : { description }),
    ingredients: prepareIngredients(input.ingredients),
    steps: prepareSteps(input.steps),
    ...(servings === undefined ? {} : { servings }),
    ...(prepMinutes === undefined ? {} : { prepMinutes }),
    ...(cookMinutes === undefined ? {} : { cookMinutes }),
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

  return {
    version: input.version,
    meals: input.meals.map(({ id, ...content }) => ({
      id: requiredText(id, "Catalogue meal ID", RECIPE_LIMITS.catalogueMealId),
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
  const ids = new Set<string>();
  for (const value of values) {
    const id = value.id.trim();
    if (ids.has(id)) {
      throw new RecipeValidationError(`${label} IDs must be unique.`);
    }
    ids.add(id);
  }
}
