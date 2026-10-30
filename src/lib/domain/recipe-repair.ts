import type { RecipeReviewIssue } from "./recipes";

export function buildRecipeRepairPatch(
  issues: RecipeReviewIssue[],
  values: Record<string, string>,
) {
  const metadataIssues = issues;
  const result: {
    servings?: number;
    prepMinutes?: number;
    cookMinutes?: number;
  } = {};
  for (const issue of metadataIssues) {
    const rawValue = values[issue]?.trim();
    if (!rawValue && issue !== "servings") continue;
    if (!validWholeNumber(rawValue, issue === "servings" ? 1 : 0)) return null;
    const value = Number(rawValue);
    if (issue === "servings") result.servings = value;
    if (issue === "prep_minutes") result.prepMinutes = value;
    if (issue === "cook_minutes") result.cookMinutes = value;
  }
  const needsTime = metadataIssues.some((issue) => issue !== "servings");
  if (
    needsTime &&
    result.prepMinutes === undefined &&
    result.cookMinutes === undefined
  )
    return null;
  return result;
}

export function recipeRepairValuesComplete(
  issues: RecipeReviewIssue[],
  values: Record<string, string>,
) {
  if (issues.includes("servings") && !validWholeNumber(values.servings, 1))
    return false;
  const timeIssues = issues.filter((issue) => issue !== "servings");
  if (timeIssues.length === 0) return true;
  return timeIssues.some((issue) => validWholeNumber(values[issue], 0));
}

function validWholeNumber(value: string | undefined, minimum = 0) {
  if (value === undefined || value.trim() === "") return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= 10_080;
}
