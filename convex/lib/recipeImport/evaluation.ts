import type { RecipeContent } from "../../../src/lib/domain/recipes";

export type RecipeVerification = {
  minimumIngredients: number;
  minimumSteps: number;
  ingredients: Array<{ name: string; aliases?: string[]; amounts: string[] }>;
  methodFacts: string[];
  methodAlternatives?: string[][];
};

export function normalizeFact(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/⁄/g, "/")
    .replace(/[–—]/g, "-")
    .replace(/\bchilli\b/g, "chili")
    .replace(/\s*([/\-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
export function containsFact(text: string, fact: string) {
  const actual = normalizeFact(text);
  const expected = normalizeFact(fact);
  let at = actual.indexOf(expected);
  while (at >= 0) {
    if (
      (!/^\d/.test(expected) || !/\d/.test(actual[at - 1] ?? "")) &&
      (!/\d$/.test(expected) || !/\d/.test(actual[at + expected.length] ?? ""))
    )
      return true;
    at = actual.indexOf(expected, at + 1);
  }
  return false;
}

/** Independent declared facts, never a model grading its own answer. */
export function verifyRecipe(
  recipe: RecipeContent,
  expected: RecipeVerification,
) {
  const missing: string[] = [];
  const amountIdentity = (value: string) =>
    normalizeFact(value)
      .replace(/\b(cups|cans|cloves)\b/g, (word) => word.slice(0, -1))
      .replace(/\s/g, "");
  if (recipe.ingredients.length < expected.minimumIngredients)
    missing.push("ingredient_count");
  if (recipe.steps.length < expected.minimumSteps) missing.push("step_count");
  for (const fact of expected.ingredients) {
    if (
      !recipe.ingredients.some(
        (line) =>
          [fact.name, ...(fact.aliases ?? [])].some((name) =>
            containsFact(line.name, name),
          ) &&
          fact.amounts.some((amount) =>
            [
              line.amountText ?? "",
              ...(line.quantity
                ? [[line.quantity, line.unit].filter(Boolean).join(" ")]
                : []),
            ].some(
              (actual) => amountIdentity(actual) === amountIdentity(amount),
            ),
          ),
      )
    )
      missing.push(`ingredient:${fact.name}`);
  }
  // Referenced recipe notes are visible in Cook; unrelated notes cannot satisfy a method fact.
  const method = recipe.steps
    .map((step) =>
      [
        step.text,
        ...(step.noteRefs ?? []).map(
          (id) => recipe.notes?.find((note) => note.id === id)?.text ?? "",
        ),
      ].join("\n"),
    )
    .join("\n");
  for (const fact of expected.methodFacts)
    if (!containsFact(method, fact)) missing.push(`method:${fact}`);
  for (const alternatives of expected.methodAlternatives ?? [])
    if (!alternatives.some((fact) => containsFact(method, fact)))
      missing.push(`method:${alternatives.join("|")}`);
  return missing;
}
