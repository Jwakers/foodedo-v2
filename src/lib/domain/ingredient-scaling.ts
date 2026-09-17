import type { RecipeIngredientLine } from "./recipes";

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
  return {
    ...line,
    quantity: formatScaledNumber((number * servings) / baseServings),
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
