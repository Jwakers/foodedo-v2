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
