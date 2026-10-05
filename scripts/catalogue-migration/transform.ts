import { createHash } from "node:crypto";

import type {
  CostBand,
  ProteinCategory,
  RecipeContent,
  RecipeIngredientLine,
  RecipeStep,
  ShoppingCategory,
} from "../../src/lib/domain/recipes";
import { prepareRecipeContent } from "../../src/lib/domain/recipes";

export const CATALOGUE_MIGRATION_SCHEMA_VERSION = 1;

export type V1Ingredient = {
  id?: string;
  ingredientId?: string;
  name: string;
  amount?: number | string | null;
  unit?: string;
  preparation?: string | null;
};

export type V1MethodStep = {
  title?: string;
  description?: string;
};

export type V1SystemRecipe = {
  _id: string;
  _creationTime: number;
  title: string;
  description?: string;
  image?: string;
  prepTime?: number;
  cookTime?: number;
  serves?: number;
  ingredients?: V1Ingredient[];
  method?: V1MethodStep[];
  primaryProtein?: string;
  publicSlug?: string;
  source?: string;
};

export type V1IngredientMetadata = {
  _id: string;
  foodGroup?: string;
  foodSubGroup?: string;
};

export type InferenceEvidence = {
  value: unknown;
  evidence: string[];
  requiresApproval: true;
};

export type MigrationCandidate = {
  legacyV1RecipeId: string;
  inSeed: boolean;
  flags: string[];
  imageUrl: string;
  imageFile?: string;
  imageSha256?: string;
  meal: RecipeContent & {
    id: string;
    slug: string;
    version: 1;
  };
  inferred: {
    costBand: InferenceEvidence;
    preheat?: InferenceEvidence;
    timerCues?: InferenceEvidence;
  };
};

const PROTEIN_MAP: Record<string, ProteinCategory> = {
  chicken: "chicken",
  turkey: "chicken",
  beef: "beef",
  pork: "pork",
  lamb: "lamb",
  fish: "fish",
  seafood: "fish",
  vegetarian: "meat-free",
  vegan: "meat-free",
  none: "meat-free",
};

const FRUIT_AND_VEG_GROUPS = new Set([
  "fruits",
  "gourds",
  "herbs and spices",
  "vegetables",
]);
const MEAT_AND_FISH_GROUPS = new Set(["animal foods", "aquatic foods"]);
const DAIRY_AND_EGGS_GROUPS = new Set(["eggs", "milk and milk products"]);
const BAKERY_SUBGROUPS = new Set([
  "bread products",
  "flat breads",
  "leavened breads",
  "other breads",
  "sweet breads",
]);
const PANTRY_GROUPS = new Set([
  "baking goods",
  "beverages",
  "cereals and cereal products",
  "cocoa and cocoa products",
  "coffee and coffee products",
  "confectioneries",
  "fats and oils",
  "nuts",
  "pulses",
  "snack foods",
  "soy",
  "teas",
]);

const NAME_CATEGORY_RULES: Array<{
  category: ShoppingCategory;
  patterns: RegExp[];
}> = [
  {
    category: "other",
    patterns: [/^(boiling )?water$/],
  },
  {
    category: "bakery",
    patterns: [
      /\b(bread|breadcrumbs|buns?|loaf|tortillas?|wraps?|taco shells)\b/,
    ],
  },
  {
    category: "pantry",
    patterns: [
      /\b(stock|sauce|paste|passata|pesto|gochujang|harissa|miso)\b/,
      /\b(puree|purée|seasoning|spice|paprika|cumin|turmeric|cinnamon|nutmeg)\b/,
      /\b(black pepper|white pepper|peppercorns?|chilli flakes|chili flakes)\b/,
      /\b(dried|oil|salt|sugar|syrup|vinegar|sherry|wine)\b/,
      /\b(rice|noodles|pasta|spaghetti|macaroni|lasagna sheets|couscous|quinoa)\b/,
      /\b(flour|cornflour|cornstarch)\b/,
      /\b(canned|tinned)\b/,
      /\b(black beans|butter beans|kidney beans|white beans|chickpeas?|lentils?)\b/,
      /\b(corn|sweetcorn|tofu|tempeh|nutritional yeast)\b/,
      /\b(peanut butter|peanuts?|walnuts?|sesame seeds?)\b/,
      /\b(coconut milk|lemon juice|lime juice|orange juice)\b/,
      /\b(honey|hummus|mayonnaise|mustard|olives?|capers)\b/,
      /\b(pastry)\b/,
    ],
  },
  {
    category: "dairy_and_eggs",
    patterns: [
      /\b(egg|eggs|egg yolks)\b/,
      /\b(cheese|cheddar|mozzarella|parmesan|pecorino|gruyère|gruyere)\b/,
      /\b(yogurt|yoghurt|cream|creme fraiche|halloumi|paneer|ricotta)\b/,
      /\b(milk|butter)\b/,
    ],
  },
  {
    category: "meat_and_fish",
    patterns: [
      /\b(beef|steak|chicken|turkey|pork|pancetta|chorizo|gammon)\b/,
      /\b(lamb|duck|venison)\b/,
      /\b(cod|haddock|mackerel|salmon|sardines?|prawns?|shrimp|fish fillet)\b/,
    ],
  },
  {
    category: "fruit_and_veg",
    patterns: [
      /\b(apple|aubergine|avocado|beansprouts?|broccoli|cabbage|carrots?)\b/,
      /\b(cauliflower|celery|courgette|cucumber|lettuce|salad leaves)\b/,
      /\b(mushrooms?|potatoes?|sweet potato|spinach|peas|green beans)\b/,
      /\b(onions?|leeks?|garlic|ginger|lemongrass|chilli|chili)\b/,
      /\b(peppers?|tomatoes?|mango|orange|lemons?|limes?)\b/,
      /\b(basil|chives|cilantro|coriander|dill|mint|oregano|parsley|thyme)\b/,
      /\b(mixed vegetables|coleslaw|guacamole|daikon radish)\b/,
    ],
  },
];

const PREMIUM_PROTEINS = [
  "lamb",
  "duck",
  "venison",
  "steak",
  "sirloin",
  "salmon",
  "prawn",
  "shrimp",
  "sea bass",
  "mackerel",
];
const BUDGET_MARKERS = [
  "bean",
  "chickpea",
  "lentil",
  "tofu",
  "egg",
  "pasta",
  "potato",
  "rice",
];

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export function allocateSlugs(recipes: V1SystemRecipe[]): Map<string, string> {
  const allocated = new Map<string, string>();
  const used = new Set<string>();
  for (const recipe of [...recipes].sort((a, b) =>
    a._id.localeCompare(b._id),
  )) {
    const base = slugify(recipe.publicSlug || recipe.title) || "recipe";
    let slug = base;
    if (used.has(slug)) slug = `${base}-${stableHash(recipe._id).slice(0, 8)}`;
    used.add(slug);
    allocated.set(recipe._id, slug);
  }
  return allocated;
}

export function mapProtein(value: string | undefined): ProteinCategory {
  return PROTEIN_MAP[value?.toLowerCase() ?? ""] ?? "other";
}

export function mapShoppingCategory(
  metadata: V1IngredientMetadata | undefined,
  ingredientName?: string,
): ShoppingCategory {
  const normalizedName = ingredientName
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (normalizedName) {
    for (const rule of NAME_CATEGORY_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(normalizedName))) {
        return rule.category;
      }
    }
  }
  const group = metadata?.foodGroup?.trim().toLowerCase();
  const subgroup = metadata?.foodSubGroup?.trim().toLowerCase();
  if (subgroup && BAKERY_SUBGROUPS.has(subgroup)) return "bakery";
  if (group && FRUIT_AND_VEG_GROUPS.has(group)) return "fruit_and_veg";
  if (group && MEAT_AND_FISH_GROUPS.has(group)) return "meat_and_fish";
  if (group && DAIRY_AND_EGGS_GROUPS.has(group)) return "dairy_and_eggs";
  if (group && PANTRY_GROUPS.has(group)) return "pantry";
  return "other";
}

export function formatAmount(
  amount: V1Ingredient["amount"],
): string | undefined {
  if (amount === undefined || amount === null || amount === "")
    return undefined;
  if (typeof amount === "number" && !Number.isFinite(amount)) return undefined;
  return String(amount);
}

function stableLineId(
  prefix: "ingredient" | "step" | "timer",
  recipeId: string,
  index: number,
  text: string,
) {
  return `${prefix}-${stableHash(`${recipeId}:${index}:${text}`).slice(0, 16)}`;
}

export function inferPreheat(
  steps: V1MethodStep[],
): InferenceEvidence | undefined {
  const evidence: string[] = [];
  const temperatures: number[] = [];
  const pattern = /preheat[^.]{0,100}?(\d{2,3})\s*°?\s*c\b/gi;
  for (const step of steps) {
    const text = `${step.title ?? ""}: ${step.description ?? ""}`.trim();
    for (const match of text.matchAll(pattern)) {
      const temperature = Number(match[1]);
      if (temperature >= 80 && temperature <= 300) {
        temperatures.push(temperature);
        evidence.push(match[0]);
      }
    }
  }
  if (temperatures.length === 0) return undefined;
  return {
    value: { appliance: "oven", temperatureC: temperatures[0] },
    evidence,
    requiresApproval: true,
  };
}

export function inferTimerCues(
  recipeId: string,
  steps: V1MethodStep[],
): { steps: RecipeStep[]; evidence: InferenceEvidence | undefined } {
  const evidence: string[] = [];
  let cueIndex = 0;
  const mapped = steps.map((step, stepIndex) => {
    const title = step.title?.trim() ?? "";
    const description = step.description?.trim() ?? "";
    const text =
      title && description ? `${title}: ${description}` : description || title;
    const timerCues: NonNullable<RecipeStep["timerCues"]> = [];
    const pattern =
      /\b(?:for\s+)?(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(minutes?|mins?|hours?|hrs?)\b/gi;
    for (const match of text.matchAll(pattern)) {
      const low = Number(match[1]);
      const high = match[2] ? Number(match[2]) : low;
      const unit = match[3]?.toLowerCase() ?? "minutes";
      const seconds = Math.max(low, high) * (unit.startsWith("h") ? 3600 : 60);
      if (seconds <= 0 || seconds > 24 * 3600) continue;
      const label = title || `Step ${stepIndex + 1}`;
      timerCues.push({
        id: stableLineId("timer", recipeId, cueIndex++, match[0]),
        label: label.slice(0, 160),
        durationSeconds: seconds,
      });
      evidence.push(`${label}: ${match[0]}`);
    }
    return {
      id: stableLineId("step", recipeId, stepIndex, text),
      text,
      ...(timerCues.length === 0 ? {} : { timerCues }),
    };
  });
  return {
    steps: mapped,
    evidence:
      evidence.length === 0
        ? undefined
        : {
            value: "timer cues attached to steps",
            evidence,
            requiresApproval: true,
          },
  };
}

export function inferCostBand(recipe: V1SystemRecipe): InferenceEvidence {
  const blob = [
    recipe.title,
    ...(recipe.ingredients ?? []).map((line) => line.name),
  ]
    .join(" ")
    .toLowerCase();
  const premiumMatches = PREMIUM_PROTEINS.filter((marker) =>
    blob.includes(marker),
  );
  const budgetMatches = BUDGET_MARKERS.filter((marker) =>
    blob.includes(marker),
  );
  let value: CostBand = "standard";
  if (premiumMatches.length > 0) value = "premium";
  else if (
    budgetMatches.length > 0 &&
    mapProtein(recipe.primaryProtein) === "meat-free"
  ) {
    value = "budget";
  }
  return {
    value,
    evidence: [
      `UK relative-cost rubric; premium markers: ${premiumMatches.join(", ") || "none"}; budget markers: ${budgetMatches.join(", ") || "none"}.`,
    ],
    requiresApproval: true,
  };
}

export function transformRecipe(args: {
  recipe: V1SystemRecipe;
  slug: string;
  seedRecipeKeys: Set<string>;
  ingredientMetadata: Map<string, V1IngredientMetadata>;
  imageFile?: string;
  imageSha256?: string;
}): MigrationCandidate {
  const { recipe } = args;
  const flags: string[] = [];
  const inSeed = args.seedRecipeKeys.has(slugify(recipe.title));
  if (!inSeed) flags.push("absent_from_v1_seed");
  if (!recipe.publicSlug) flags.push("missing_v1_public_slug");
  if (!recipe.image) flags.push("missing_image");
  if (!recipe.ingredients?.length) flags.push("missing_ingredients");
  if (!recipe.method?.length) flags.push("missing_steps");

  const ingredients: RecipeIngredientLine[] = (recipe.ingredients ?? []).map(
    (line, index) => {
      const metadata = line.ingredientId
        ? args.ingredientMetadata.get(line.ingredientId)
        : undefined;
      const shoppingCategory = mapShoppingCategory(metadata, line.name);
      if (shoppingCategory === "other") {
        flags.push(`unresolved_shopping_category:${index + 1}`);
      }
      return {
        id:
          line.id?.trim() ||
          stableLineId("ingredient", recipe._id, index, line.name),
        name: line.name,
        shoppingCategory,
        ...(formatAmount(line.amount) === undefined
          ? {}
          : { quantity: formatAmount(line.amount) }),
        ...(line.unit ? { unit: line.unit } : {}),
        ...(line.preparation ? { note: line.preparation } : {}),
      };
    },
  );
  const timerResult = inferTimerCues(recipe._id, recipe.method ?? []);
  const preheat = inferPreheat(recipe.method ?? []);
  const costBand = inferCostBand(recipe);
  const content = prepareRecipeContent({
    title: recipe.title,
    ...(recipe.description ? { description: recipe.description } : {}),
    ingredients,
    steps: timerResult.steps,
    ...(recipe.serves === undefined ? {} : { servings: recipe.serves }),
    ...(recipe.prepTime === undefined ? {} : { prepMinutes: recipe.prepTime }),
    ...(recipe.cookTime === undefined ? {} : { cookMinutes: recipe.cookTime }),
    proteinCategory: mapProtein(recipe.primaryProtein),
    costBand: costBand.value as CostBand,
    ...(preheat ? { preheat: preheat.value as RecipeContent["preheat"] } : {}),
    servingScaling: "safe",
  });
  return {
    legacyV1RecipeId: recipe._id,
    inSeed,
    flags: [...new Set(flags)],
    imageUrl: recipe.image ?? "",
    ...(args.imageFile === undefined ? {} : { imageFile: args.imageFile }),
    ...(args.imageSha256 === undefined
      ? {}
      : { imageSha256: args.imageSha256 }),
    meal: { id: args.slug, slug: args.slug, version: 1, ...content },
    inferred: {
      costBand,
      ...(preheat ? { preheat } : {}),
      ...(timerResult.evidence ? { timerCues: timerResult.evidence } : {}),
    },
  };
}

export function validateCandidateSet(candidates: MigrationCandidate[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const sourceIds = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.meal.id))
      errors.push(`Duplicate meal id: ${candidate.meal.id}`);
    if (slugs.has(candidate.meal.slug))
      errors.push(`Duplicate slug: ${candidate.meal.slug}`);
    if (sourceIds.has(candidate.legacyV1RecipeId)) {
      errors.push(`Duplicate V1 id: ${candidate.legacyV1RecipeId}`);
    }
    if (!candidate.meal.ingredients.length)
      errors.push(`${candidate.meal.id}: no ingredients`);
    if (!candidate.meal.steps.length)
      errors.push(`${candidate.meal.id}: no steps`);
    ids.add(candidate.meal.id);
    slugs.add(candidate.meal.slug);
    sourceIds.add(candidate.legacyV1RecipeId);
  }
  return errors;
}
