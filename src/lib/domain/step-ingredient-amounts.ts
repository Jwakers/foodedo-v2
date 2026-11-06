import {
  excludedIngredient,
  ingredientSentenceAt,
} from "./step-ingredient-language";

// Detect fixed prose amounts for the existing all-or-nothing serving policy.
// This does not calculate portions or alter the source instruction.
const quantity = String.raw`(?:\d+(?:[.,]\d+)?(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+|[¼½¾⅓⅔])?|[¼½¾⅓⅔]|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+and\s+a\s+half)?|(?:half|quarter)(?:\s+(?:a|an))?|a|an)`;
const unit = String.raw`(?:kg|mg|g|ml|l|litres?|liters?|millilitres?|milliliters?|grams?|kilograms?|tsp|tbsp|teaspoons?|tablespoons?|cups?|pints?|fl\.?\s*oz|oz|ounces?|lbs?|pounds?|cloves?|tins?|cans?|packets?|packs?|bunch(?:es)?|handfuls?)`;
const modifiers = String.raw`(?:(?:large|medium|small|finely|roughly|thinly|chopped|diced|sliced|minced|crushed|grated|peeled|remaining|reserved)\s+)*`;
const measured = new RegExp(
  String.raw`(?:^|[^\p{L}\p{N}])${quantity}\s*[-–]?\s*${unit}\b`,
  "giu",
);
const beforeIngredient = new RegExp(
  String.raw`(?:^|[^\p{L}\p{N}])${quantity}\s*(?:${unit}\.?\s+)?(?:of\s+)?(?:the\s+)?${modifiers}$`,
  "iu",
);

function operationalAmountAfter(after: string) {
  if (/^\s+each\s+of\b/i.test(after)) return false;
  const process = after.match(
    /^\s*((?:[\p{L}-]+\s+){0,5}?)(at a time|per (?:batch|person|portion|serving)|for each|for every(?=\s+\d)|each)\b/iu,
  );
  const variableTarget =
    process?.[2] !== "for each" ||
    /^\s+(?:the\s+)?(?:batch|person|portion|serving|piece|fillet|breast|ball|pancake)\b/i.test(
      after.slice(process[0].length),
    );
  return (
    (process !== null &&
      variableTarget &&
      !/\b(?:and|then|with|into|to|for|before|after|stir|toss|add|mix|cook|fry|roast)\b/i.test(
        process[1]!,
      )) ||
    /^\s+(?:balls|patties|meatballs)\b/i.test(after)
  );
}

function proportionalAmountBefore(before: string) {
  return /\b(?:per|for each|for every)\s*$/i.test(before);
}

export function hasIngredientAmountBefore(before: string) {
  return beforeIngredient.test(before);
}

export function hasExplicitIngredientAmountBefore(before: string, after = "") {
  if (operationalAmountAfter(after)) return false;
  // A share of the existing quantity is relative, rather than a fixed spoonful.
  if (
    /(?:\b(?:half|quarter|third)|\d+\s*\/\s*\d+|[¼½¾⅓⅔])\s+(?:of\s+)?the\s*(?:(?:reserved|remaining|prepared)\s+)*$/iu.test(
      before,
    )
  )
    return false;
  const match = beforeIngredient.exec(before);
  return (
    match !== null && !proportionalAmountBefore(before.slice(0, match.index))
  );
}

export function hasFixedIngredientAmounts(text: string) {
  // matchAll clones the global expression, so repeated calls have no lastIndex state.
  return Array.from(text.matchAll(measured)).some((match) => {
    const after = text.slice(match.index + match[0].length);
    const sentence = ingredientSentenceAt(
      text,
      match.index,
      match.index + match[0].length,
    );
    if (excludedIngredient(sentence.before, sentence.after)) return false;
    if (
      operationalAmountAfter(after) ||
      proportionalAmountBefore(sentence.before)
    )
      return false;
    // Equipment capacity is not an instruction to measure an ingredient.
    return !/^\s*[-–]?\s*(?:capacity\s+)?(?:pan|saucepan|pot|bowl|jug|dish|tray)\b/i.test(
      after,
    );
  });
}
