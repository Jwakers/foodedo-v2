import type { CatalogueMealSummary, RecipeSource } from "./recipes";

type Recipe = Pick<
  CatalogueMealSummary,
  | "id"
  | "slug"
  | "title"
  | "proteinCategory"
  | "prepMinutes"
  | "cookMinutes"
  | "costBand"
>;

/**
 * Two neighbours on a stable catalogue ring guarantee incoming links for every
 * published recipe. Four page-seeded picks add affinity and variety without
 * relying on behavioural tracking, popularity, or catalogue insertion order.
 */
export function selectRelatedRecipes<T extends Recipe>(
  current: Recipe & { source?: RecipeSource },
  recipes: readonly T[],
): T[] {
  // Stable ring over the catalogue for deterministic neighbours and ties.
  const ring = [
    ...new Map(recipes.map((recipe) => [recipe.id, recipe])).values(),
  ].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id));
  // Saved recipes and household snapshots have a private ID/slug; their source
  // still identifies the catalogue recipe being viewed, even after a rename.
  const catalogueId =
    current.source?.type === "catalogue"
      ? current.source.catalogueMealId
      : current.id;
  const currentTitle = normalizedTitle(current.title);
  const currentDish = dishTypeKey(current.title);
  const index = ring.findIndex((recipe) => recipe.id === catalogueId);
  const selected: T[] = [];
  const excluded = (recipe: T) =>
    recipe.id === current.id ||
    recipe.id === catalogueId ||
    recipe.slug === current.slug ||
    (currentTitle !== "" && normalizedTitle(recipe.title) === currentTitle);
  // A private/imported recipe has no ring position; its seeded picks still work.
  if (index !== -1) {
    for (
      let offset = 1;
      offset < ring.length && selected.length < 2;
      offset++
    ) {
      const recipe = ring[(index + offset) % ring.length];
      if (!excluded(recipe)) selected.push(recipe);
    }
  }
  const pool = ring.filter(
    (recipe) => !excluded(recipe) && !selected.includes(recipe),
  );
  // Prefer close matches by dish type first, then main ingredient.
  if (currentDish) {
    pickInto(
      selected,
      pool,
      (recipe) => dishTypeKey(recipe.title) === currentDish,
      // Within the same dish type, prefer same protein, then duration/cost, then deterministic tie.
      (a, b) =>
        compareByProteinThenMeta(current, a, b) ||
        compareByStableTie(catalogueId, a, b),
      6,
    );
  }
  if (selected.length < 6) {
    // Then prefer the same main ingredient (protein category).
    pickInto(
      selected,
      pool,
      (recipe) => recipe.proteinCategory === current.proteinCategory,
      (a, b) =>
        compareByMeta(current, a, b) || compareByStableTie(catalogueId, a, b),
      Math.min(6, selected.length + 2),
    );
  }
  // Fall back to the previous affinity/variety logic for any remaining slots.
  while (pool.length && selected.length < 6) {
    const score = (recipe: T) => {
      const affinity =
        (recipe.proteinCategory !== "other" &&
        recipe.proteinCategory === current.proteinCategory
          ? 2
          : 0) +
        (recipe.costBand && recipe.costBand === current.costBand ? 0.5 : 0) +
        (duration(recipe) !== null && duration(recipe) === duration(current)
          ? 0.5
          : 0);
      const repeats = selected.filter(
        (picked) => picked.proteinCategory === recipe.proteinCategory,
      ).length;
      return (
        (selected.length < 4 ? affinity : 0) +
        (hash(`${catalogueId}:${recipe.id}`) / 0xffffffff) * 3 -
        repeats * 1.5
      );
    };
    pool.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
    selected.push(pool.shift()!);
  }
  return selected;
}

function normalizedTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Extract a coarse dish-type key from a title – tacos, fajitas, chilli, curry, stir-fry, traybake, etc.
function dishTypeKey(title: string) {
  const text = normalizedTitle(title);
  // Order matters: prefer more specific multi-word keys first.
  const patterns: Array<[RegExp, string]> = [
    [/\bstir fry\b/, "stir-fry"],
    [/\borzo bake\b/, "orzo bake"],
    [/\bmac(?:aroni)? and cheese\b/, "mac and cheese"],
    [/\bgarlic bread\b/, "garlic bread"],
  ];
  for (const [re, key] of patterns) {
    if (re.test(text)) return key;
  }
  const tokens: Array<[RegExp, string]> = [
    [/\btacos?\b/, "tacos"],
    [/\bfajitas?\b/, "fajitas"],
    [/\bchill?i\b/, "chilli"],
    [/\bcurry\b/, "curry"],
    [/\bstew\b/, "stew"],
    [/\bsoup\b/, "soup"],
    [/\bsalad\b/, "salad"],
    [/\bstir[ -]?fry\b/, "stir-fry"],
    [/\btraybake\b/, "traybake"],
    [/\brisotto\b/, "risotto"],
    [/\bbolognese\b/, "bolognese"],
    [/\blasagn[ae]\b/, "lasagne"],
    [/\bburger\b/, "burger"],
    [/\bpizza\b/, "pizza"],
    [/\borzo\b/, "orzo"],
    [/\bpasta\b/, "pasta"],
    [/\bnoodles?\b/, "noodles"],
    [/\bfried rice\b/, "fried rice"],
    [/\bpil(?:au|af)\b/, "pilaf"],
    [/\bquesadillas?\b/, "quesadilla"],
    [/\benchiladas?\b/, "enchilada"],
    [/\bfrittata\b/, "frittata"],
    [/\bomelett?e\b/, "omelette"],
    [/\bbake\b/, "bake"],
  ];
  // Choose the last matching token to bias towards the final dish word (e.g. "Beef Tacos", "Turkey Chilli with Rice").
  let match: string | null = null;
  for (const [re, key] of tokens) {
    if (re.test(text)) match = key;
  }
  return match ?? "";
}

function duration(recipe: Recipe) {
  if (recipe.prepMinutes === undefined && recipe.cookMinutes === undefined)
    return null;
  const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return minutes <= 30 ? 0 : minutes <= 60 ? 1 : 2;
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  return (result ^ (result >>> 13)) >>> 0;
}

function compareByStableTie<T extends Recipe>(catalogueId: string, a: T, b: T) {
  const ha = hash(`${catalogueId}:${a.id}`);
  const hb = hash(`${catalogueId}:${b.id}`);
  return hb - ha || a.id.localeCompare(b.id);
}

function compareByMeta<T extends Recipe>(current: Recipe, a: T, b: T) {
  // Prefer total-duration bucket and then cost band matching the current recipe.
  const byDuration =
    (duration(b) === duration(current) ? 1 : 0) -
    (duration(a) === duration(current) ? 1 : 0);
  if (byDuration !== 0) return byDuration;
  const byCost =
    (b.costBand === current.costBand ? 1 : 0) -
    (a.costBand === current.costBand ? 1 : 0);
  return byCost;
}

function compareByProteinThenMeta<T extends Recipe>(
  current: Recipe,
  a: T,
  b: T,
) {
  const byProtein =
    (b.proteinCategory === current.proteinCategory ? 1 : 0) -
    (a.proteinCategory === current.proteinCategory ? 1 : 0);
  if (byProtein !== 0) return byProtein;
  return compareByMeta(current, a, b);
}

function pickInto<T>(
  selected: T[],
  pool: T[],
  include: (value: T) => boolean,
  compare: (a: T, b: T) => number,
  limit: number,
) {
  if (selected.length >= limit) return;
  const bucket = pool.filter(include);
  bucket.sort(compare);
  while (bucket.length && selected.length < limit) {
    const pick = bucket.shift()!;
    selected.push(pick);
    // Remove from pool to avoid duplicates.
    const index = pool.indexOf(pick);
    if (index >= 0) pool.splice(index, 1);
  }
}
