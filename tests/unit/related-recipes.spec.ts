import { expect, test } from "@playwright/test";
import { selectRelatedRecipes } from "../../src/lib/domain/related-recipes";
import {
  PROTEIN_CATEGORIES,
  type CatalogueMealSummary,
} from "../../src/lib/domain/recipes";

const pool: CatalogueMealSummary[] = Array.from({ length: 80 }, (_, index) => ({
  id: `meal-${index}`,
  slug: `meal-${index}`,
  title: `Meal ${index}`,
  version: 1,
  position: index,
  proteinCategory: PROTEIN_CATEGORIES[index % PROTEIN_CATEGORIES.length],
  cookMinutes: 20 + (index % 4) * 20,
}));

test("every recipe has incoming links and each page has a varied, distinct selection", () => {
  const incoming = new Set<string>();
  const selections = new Set<string>();
  for (const recipe of pool) {
    const related = selectRelatedRecipes(recipe, pool);
    expect(related).toHaveLength(6);
    expect(new Set(related.map(({ id }) => id)).size).toBe(6);
    expect(related.map(({ id }) => id)).not.toContain(recipe.id);
    expect(
      new Set(related.map(({ proteinCategory }) => proteinCategory)).size,
    ).toBeGreaterThanOrEqual(3);
    related.forEach(({ id }) => incoming.add(id));
    selections.add(
      related
        .map(({ id }) => id)
        .sort()
        .join(","),
    );
  }
  expect(incoming.size).toBe(pool.length);
  expect(selections.size).toBe(pool.length);
});

test("links are stable across catalogue ordering and do not mutate inputs", () => {
  const original = [...pool];
  expect(selectRelatedRecipes(pool[0], [...pool].reverse())).toEqual(
    selectRelatedRecipes(pool[0], pool),
  );
  expect(pool).toEqual(original);
});

test("small catalogues, duplicate revisions, and an absent source do not repeat links", () => {
  expect(selectRelatedRecipes(pool[0], [])).toEqual([]);
  expect(selectRelatedRecipes(pool[0], [pool[0]])).toEqual([]);
  expect(selectRelatedRecipes(pool[0], [pool[0], pool[1], pool[1]])).toEqual([
    pool[1],
  ]);
  const related = selectRelatedRecipes(
    { ...pool[0], id: "private", slug: "private" },
    pool,
  );
  expect(related).toHaveLength(6);
  expect(new Set(related.map(({ id }) => id)).size).toBe(6);
  expect(
    selectRelatedRecipes(pool[0], [{ ...pool[1], slug: pool[0].slug }]),
  ).toEqual([]);
});

test("saved catalogue recipes exclude their original across private IDs, slugs and renamed titles", () => {
  const original = { ...pool[0], title: "Peri Peri Wraps" };
  const saved = {
    ...original,
    id: "private-recipe-id",
    slug: "personal-private-recipe-id",
    title: "My favourite wraps",
    source: {
      type: "catalogue" as const,
      catalogueMealId: original.id,
      catalogueVersion: 1,
    },
  };
  const catalogue = [original, ...pool.slice(1)];
  const related = selectRelatedRecipes(saved, catalogue);
  expect(related).toHaveLength(6);
  expect(related.map(({ id }) => id)).not.toContain(original.id);
  expect(related).toEqual(selectRelatedRecipes(original, catalogue));
});

test("duplicate titles are excluded even with different IDs, slugs and punctuation", () => {
  const current = { ...pool[0], title: "Peri Peri Wraps" };
  const duplicate = { ...pool[1], title: "  PERI-PERI_wraps  " };
  const related = selectRelatedRecipes(current, [
    current,
    duplicate,
    ...pool.slice(2),
  ]);
  expect(related).toHaveLength(6);
  expect(related.map(({ id }) => id)).not.toContain(duplicate.id);
  expect(related.map(({ id }) => id)).not.toContain(current.id);
});

test("prefers close matches by dish type, then main ingredient", () => {
  const tacosAndFriends: CatalogueMealSummary[] = [
    {
      id: "beef-tacos",
      slug: "beef-tacos",
      title: "Beef Tacos",
      version: 1,
      position: 1,
      proteinCategory: "beef",
      cookMinutes: 20,
      servings: 2,
    },
    {
      id: "turkey-tacos",
      slug: "turkey-tacos",
      title: "Turkey Tacos",
      version: 1,
      position: 2,
      proteinCategory: "turkey",
      cookMinutes: 20,
      servings: 2,
    },
    {
      id: "pork-tacos",
      slug: "pork-tacos",
      title: "Pork Tacos with Fresh Salsa",
      version: 1,
      position: 3,
      proteinCategory: "pork",
      cookMinutes: 25,
      servings: 2,
    },
    {
      id: "beef-fajitas",
      slug: "beef-fajitas",
      title: "Beef Fajitas",
      version: 1,
      position: 4,
      proteinCategory: "beef",
      cookMinutes: 25,
      servings: 2,
    },
    {
      id: "baked-cod",
      slug: "baked-cod",
      title: "Baked Cod",
      version: 1,
      position: 5,
      proteinCategory: "fish",
      cookMinutes: 25,
      servings: 2,
    },
    {
      id: "tofu-stir-fry",
      slug: "tofu-stir-fry",
      title: "Tofu Stir-Fry",
      version: 1,
      position: 6,
      proteinCategory: "meat-free",
      cookMinutes: 15,
      servings: 2,
    },
  ];
  // An imported source has no mandatory ring neighbours, so this exercises
  // affinity ordering independently of the incoming-link guarantee.
  const current = { ...tacosAndFriends[0]!, id: "imported-beef-tacos" };
  const related = selectRelatedRecipes(current, [
    ...tacosAndFriends,
    ...pool.map((recipe) => ({ ...recipe, proteinCategory: "fish" as const })),
  ]).map((recipe) => recipe.id);
  expect(related).toHaveLength(6);
  expect(new Set(related.slice(0, 2))).toEqual(
    new Set(["turkey-tacos", "pork-tacos"]),
  );
  expect(related[2]).toBe("beef-fajitas");
});
