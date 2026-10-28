import {
  RECIPE_LIMITS,
  type RecipeContent,
  type RecipeIngredientLine,
  type RecipeSource,
} from "./recipes";

type ServingMetadata = Pick<
  RecipeContent,
  "servings" | "minimumServings" | "servingScaling"
> & {
  source?: Pick<RecipeSource, "type">;
};

/** Older private imports must keep their authored amounts until proven scalable. */
export function recipeServingScaling(
  recipe: Pick<ServingMetadata, "servingScaling" | "source">,
) {
  return (
    recipe.servingScaling ??
    (recipe.source?.type === "import" ? "source_only" : "safe")
  );
}

export type ScaledIngredientLine = RecipeIngredientLine;

const fractionValues: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

const fractionCharacters = Object.keys(fractionValues).join("");
const simpleAmount = new RegExp(`^(\\d+(?:\\.\\d+)?|[${fractionCharacters}])$`);

/** Whether the existing scaling renderer can safely interpret an authored amount. */
export function canScaleIngredientQuantity(quantity: string | undefined) {
  return (
    quantity !== undefined &&
    (simpleAmount.test(quantity.trim()) || /^to taste$/i.test(quantity.trim()))
  );
}

/** Safe cooking display scaling. Authoritative text remains untouched when ambiguous. */
export function scaleIngredientLine(
  line: RecipeIngredientLine,
  baseServings: number | undefined,
  servings: number,
): RecipeIngredientLine {
  if (!line.quantity || !baseServings || baseServings < 1) return line;
  const quantity = line.quantity.trim();
  if (!simpleAmount.test(quantity)) return line;
  const number = fractionValues[quantity] ?? Number(quantity);
  if (!Number.isFinite(number)) return line;
  const scaledQuantity = formatScaledNumber((number * servings) / baseServings);
  return {
    ...line,
    quantity: scaledQuantity,
    ...(line.amountText !== undefined && servings !== baseServings
      ? { amountText: [scaledQuantity, line.unit].filter(Boolean).join(" ") }
      : {}),
  };
}

export function scaleIngredients(
  ingredients: readonly RecipeIngredientLine[],
  baseServings: number | undefined,
  servings: number,
): ScaledIngredientLine[] {
  return ingredients.map((line) =>
    scaleIngredientLine(line, baseServings, servings),
  );
}

function formatScaledNumber(value: number) {
  const fractions: Array<[number, string]> = [
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
  ];
  for (const [candidate, label] of fractions) {
    if (Math.abs(value - candidate) < 0.001) return label;
  }
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(2));
  if (value > 0 && rounded === 0) return String(value);
  return String(rounded);
}

/** The same serving policy is used before displaying or buying any ingredients. */
export function resolveRecipeServings(
  recipe: ServingMetadata,
  requestedServings: number,
) {
  const requested =
    Number.isInteger(requestedServings) &&
    requestedServings >= 1 &&
    requestedServings <= RECIPE_LIMITS.servings
      ? requestedServings
      : (recipe.servings ?? 1);
  const canScale =
    recipe.servings !== undefined &&
    recipeServingScaling(recipe) !== "source_only";
  const cookingServings = canScale
    ? Math.max(requested, recipe.minimumServings ?? 1)
    : recipe.servings;
  return { requestedServings: requested, cookingServings, canScale };
}

export function recipeServingModel(
  recipe: ServingMetadata & Pick<RecipeContent, "ingredients">,
  requestedServings: number,
) {
  const resolved = resolveRecipeServings(recipe, requestedServings);
  return {
    ...resolved,
    ingredients:
      resolved.canScale && resolved.cookingServings !== undefined
        ? scaleIngredients(
            recipe.ingredients,
            recipe.servings,
            resolved.cookingServings,
          )
        : [...recipe.ingredients],
  };
}

/** Only a known minimum adjustment earns a leftover claim. */
export function minimumServingsNotice(
  recipe: ServingMetadata,
  requestedServings: number,
  actualCookingServings?: number,
) {
  const {
    cookingServings: resolvedServings,
    canScale,
    requestedServings: requested,
  } = resolveRecipeServings(recipe, requestedServings);
  const cookingServings = actualCookingServings ?? resolvedServings;
  if (
    !canScale ||
    cookingServings === undefined ||
    !recipe.minimumServings ||
    requested >= recipe.minimumServings
  )
    return null;
  const leftovers = cookingServings - requested;
  if (leftovers <= 0) return null;
  return `Makes ${cookingServings} portions for ${requested} ${requested === 1 ? "person" : "people"}. ${leftovers} ${leftovers === 1 ? "portion" : "portions"} left over.`;
}
