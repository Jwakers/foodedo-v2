import { prepareRecipeContent, type RecipeContent } from "./recipes";
import { canScaleIngredientQuantity } from "./ingredient-scaling";

export type EditorialTags = {
  cuisines: string[];
  mealOccasion: "lunch" | "dinner" | "unknown";
  cookingMethods: string[];
  proteinSource: string;
  carbBase: string;
  flavourProfile: string[];
  complexity: "simple" | "moderate" | "complex" | "unknown";
  vegetarian: "yes" | "no" | "unknown";
  vegan: "yes" | "no" | "unknown";
};
export type QualityFinding = {
  area: string;
  message: string;
  blocking: boolean;
};
export type AnalysisMeal = {
  key: string;
  content: RecipeContent;
  tags?: EditorialTags;
  isCatalogueRevision?: boolean;
};
export const timeBand = (minutes: number | undefined) =>
  minutes === undefined
    ? "unknown"
    : minutes <= 20
      ? "≤20"
      : minutes <= 30
        ? "21–30"
        : minutes <= 45
          ? "31–45"
          : minutes <= 60
            ? "46–60"
            : ">60";
export function normaliseRecipeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function count(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, count }));
}
export function catalogueStatistics(meals: AnalysisMeal[]) {
  // Maintenance drafts are comparisons, not additional meals in the catalogue.
  meals = meals.filter((meal) => !meal.isCatalogueRevision);
  const contents = meals.map((meal) => meal.content);
  const reviewed = meals.flatMap((meal) => (meal.tags ? [meal.tags] : []));
  const known = (values: string[]) =>
    values.filter((value) => value !== "unknown" && value !== "");
  return {
    total: meals.length,
    classified: reviewed.length,
    protein: count(contents.map((r) => r.proteinCategory)),
    cost: count(contents.map((r) => r.costBand ?? "unknown")),
    prepTime: count(contents.map((r) => timeBand(r.prepMinutes))),
    cookTime: count(contents.map((r) => timeBand(r.cookMinutes))),
    totalTime: count(
      contents.map((r) =>
        timeBand(
          r.prepMinutes === undefined && r.cookMinutes === undefined
            ? undefined
            : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0),
        ),
      ),
    ),
    ingredients: count(
      contents.flatMap((r) => [
        ...new Set(r.ingredients.map((i) => normaliseRecipeText(i.name))),
      ]),
    ),
    ingredientCounts: contents.map((r) => r.ingredients.length),
    cuisines: count(known(reviewed.flatMap((t) => t.cuisines))),
    mealOccasion: count(known(reviewed.map((t) => t.mealOccasion))),
    methods: count(known(reviewed.flatMap((t) => t.cookingMethods))),
    proteinSources: count(known(reviewed.map((t) => t.proteinSource))),
    carbBases: count(known(reviewed.map((t) => t.carbBase))),
    flavourProfiles: count(known(reviewed.flatMap((t) => t.flavourProfile))),
    complexity: count(known(reviewed.map((t) => t.complexity))),
    vegetarian: count(known(reviewed.map((t) => t.vegetarian))),
    vegan: count(known(reviewed.map((t) => t.vegan))),
  };
}
export function nearestRecipes(recipe: RecipeContent, meals: AnalysisMeal[]) {
  const names = new Set(
    recipe.ingredients.map((i) => normaliseRecipeText(i.name)),
  );
  const title = normaliseRecipeText(recipe.title);
  return meals
    .map((meal) => {
      const other = new Set(
        meal.content.ingredients.map((i) => normaliseRecipeText(i.name)),
      );
      const overlap =
        [...names].filter((n) => other.has(n)).length /
        Math.max(1, new Set([...names, ...other]).size);
      const words = new Set(title.split(" "));
      const titleOverlap =
        normaliseRecipeText(meal.content.title)
          .split(" ")
          .filter((w) => words.has(w)).length / Math.max(1, words.size);
      return {
        key: meal.key,
        title: meal.content.title,
        exact: title === normaliseRecipeText(meal.content.title),
        overlap,
        similarity: overlap * 0.7 + Math.min(1, titleOverlap) * 0.3,
      };
    })
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) || b.similarity - a.similarity,
    )
    .slice(0, 5);
}
export function validateGeneratedRecipe(
  input: RecipeContent,
  meals: AnalysisMeal[] = [],
) {
  const content = prepareRecipeContent(input);
  content.servingScaling = content.ingredients.every((line) =>
    canScaleIngredientQuantity(line.quantity),
  )
    ? "safe"
    : "source_only";
  const findings: QualityFinding[] = [];
  const block = (area: string, message: string) =>
    findings.push({ area, message, blocking: true });
  if (!content.servings || content.servings > 12)
    block("servings", "Provide realistic home-cooking servings (1–12).");
  if (content.prepMinutes === undefined || content.cookMinutes === undefined)
    block(
      "timing",
      "Provide preparation and cooking time; explicitly use zero for a phase that is not needed.",
    );
  if (content.steps.length < 2)
    block("method", "Split the method into at least two actionable steps.");
  for (const line of content.ingredients) {
    const q = line.quantity?.trim();
    if (!q) {
      if (!/^(salt|black pepper|pepper|water)$/i.test(line.name))
        block("ingredients", `Specify an amount for ${line.name}.`);
      continue;
    }
    if (
      /^[-−]/.test(q) ||
      /(?:NaN|Infinity)/i.test(q) ||
      (/^\d+(?:\.\d+)?$/.test(q) && Number(q) <= 0)
    )
      block("ingredients", `Invalid quantity for ${line.name}.`);
    if (/^\d+(?:\.\d+)?$/.test(q) && content.servings) {
      const perServing = Number(q) / content.servings;
      if (
        (line.unit === "g" && perServing > 2000) ||
        (line.unit === "ml" && perServing > 3000)
      )
        block(
          "ingredients",
          `Implausible per-serving quantity for ${line.name}.`,
        );
    }
  }
  const method = content.steps.map((step) => step.text).join(" ");
  const rawHighRisk = content.ingredients.some(
    (line) =>
      /\b(chicken|turkey|duck|pork|minced beef|beef mince|minced lamb|lamb mince)\b/i.test(
        line.name,
      ) &&
      !/\b(stock|broth|cooked|ham|bacon|cured|smoked)\b/i.test(
        `${line.name} ${line.note ?? ""}`,
      ),
  );
  if (
    rawHighRisk &&
    !/\b75\s*°?\s*c\b[^.!?]{0,100}\b30\s*(seconds?|secs?)\b/i.test(method) &&
    !/\b70\s*°?\s*c\b[^.!?]{0,100}\b2\s*(minutes?|mins?)\b/i.test(method)
  )
    block(
      "safety",
      "Include an applicable clean-probe check: 75°C for 30 seconds or 70°C for 2 minutes for raw poultry, pork or minced meat.",
    );
  const totalMinutes = (content.prepMinutes ?? 0) + (content.cookMinutes ?? 0);
  for (const match of method.matchAll(
    /\b(?:cook|simmer|bake|roast|chill|marinate|rest|leave|refrigerate)[^.!?\d]{0,40}(\d+)\s*(?:(?:–|-|to)\s*(\d+))?\s*(minutes?|mins?|hours?|hrs?)\b/gi,
  )) {
    const duration =
      Number(match[2] ?? match[1]) *
      (/^(hours?|hrs?)$/i.test(match[3]) ? 60 : 1);
    if (duration > totalMinutes) {
      block(
        "timing",
        "A required method duration exceeds the recipe's entire preparation and cooking time.",
      );
      break;
    }
  }
  if (nearestRecipes(content, meals).some((m) => m.exact))
    block(
      "duplicate",
      "An existing recipe or pending proposal has the same title.",
    );
  return { content, findings };
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;

// Cosmetic/editorial fields do not change how a recipe is cooked. Keep the
// remaining content in this comparison so new cooking fields default to review.
export function culinaryContentChanged(
  previous: RecipeContent,
  next: RecipeContent,
) {
  const cookingContent = (input: RecipeContent) => {
    return JSON.stringify(
      canonical({
        ...input,
        title: undefined,
        description: undefined,
        proteinCategory: undefined,
        costBand: undefined,
        servingScaling: undefined,
      }),
    );
  };
  return cookingContent(previous) !== cookingContent(next);
}

export async function recipeFingerprint(content: RecipeContent) {
  // Fixed preparation and explicit ordering make fingerprints independent of object key order.
  const prepared = prepareRecipeContent(content);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(prepared))),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function generationRunSummary(run: {
  createdAt: number;
  updatedAt: number;
  usage: Array<{ costUsd?: number }>;
}) {
  const seconds = Math.max(
    0,
    Math.round((run.updatedAt - run.createdAt) / 1000),
  );
  const duration =
    seconds >= 60
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${seconds}s`;
  const known = run.usage.flatMap((event) =>
    event.costUsd === undefined ? [] : [event.costUsd],
  );
  const cost = known.length
    ? `US$${known.reduce((sum, value) => sum + value, 0).toFixed(4)}${known.length < run.usage.length ? " recorded (partial)" : ""}`
    : "cost unavailable";
  return `${duration} · ${cost}`;
}
