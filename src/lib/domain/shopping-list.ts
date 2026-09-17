import type { RecipeIngredientLine, ShoppingCategory } from "./recipes";

export const SHOPPING_LIST_LIMITS = {
  items: 500,
  itemName: 160,
} as const;

export type ShoppingListRecipe<TRecipeId extends string = string> = {
  recipeId: TRecipeId;
  title: string;
  date?: string;
  ingredients: readonly RecipeIngredientLine[];
};

export type ShoppingListCategory = ShoppingCategory;

export type ShoppingListSource<TRecipeId extends string = string> = {
  recipeId: TRecipeId;
  recipeTitle: string;
  date: string | null;
  amount: string;
};

export type DerivedShoppingListItem<TRecipeId extends string = string> = {
  name: string;
  displayName: string;
  category: ShoppingListCategory;
  detailLines: string[];
  sourceRecipeIds: TRecipeId[];
  sources: ShoppingListSource<TRecipeId>[];
};

export class ShoppingListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShoppingListValidationError";
  }
}

export function shoppingItemIdentityKey(
  name: string,
  category: ShoppingCategory,
) {
  return `${normaliseIngredientName(name)}\0${category}`;
}

export function deriveShoppingListItems<TRecipeId extends string>(
  recipes: readonly ShoppingListRecipe<TRecipeId>[],
): DerivedShoppingListItem<TRecipeId>[] {
  const itemsByKey = new Map<string, DerivedShoppingListItem<TRecipeId>>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = shoppingItemIdentityKey(
        ingredient.name,
        ingredient.shoppingCategory,
      );
      const existingItem = itemsByKey.get(key);
      const detailLine = ingredientDetailLine(ingredient, recipe.title);
      const source = {
        recipeId: recipe.recipeId,
        recipeTitle: recipe.title,
        date: recipe.date ?? null,
        amount: ingredientAmount(ingredient),
      };

      if (existingItem === undefined) {
        itemsByKey.set(key, {
          name: ingredient.name.trim(),
          displayName: "",
          category: ingredient.shoppingCategory,
          detailLines: [detailLine],
          sourceRecipeIds: [recipe.recipeId],
          sources: [source],
        });
        continue;
      }

      existingItem.detailLines.push(detailLine);
      existingItem.sources.push(source);
      if (!existingItem.sourceRecipeIds.includes(recipe.recipeId)) {
        existingItem.sourceRecipeIds.push(recipe.recipeId);
      }
    }
  }

  return [...itemsByKey.values()].map((item) => ({
    ...item,
    displayName: formatShoppingItemDisplayName(item.name, item.sources),
  }));
}

export function formatShoppingItemDisplayName<TRecipeId extends string>(
  name: string,
  sources: readonly ShoppingListSource<TRecipeId>[],
) {
  if (sources.length === 0) return name;
  const parsedAmounts = sources.map((source) => parseAmount(source.amount));
  if (parsedAmounts.some((amount) => amount === null)) return name;

  const amounts = parsedAmounts.filter(
    (amount): amount is NonNullable<typeof amount> => amount !== null,
  );
  const unit = amounts[0]?.unit ?? "";
  if (amounts.some((amount) => amount.unit !== unit)) return name;

  const quantity = amounts.reduce(
    (total, amount) => total + amount.quantity,
    0,
  );
  const quantityLabel = Number.isInteger(quantity)
    ? String(quantity)
    : String(Number(quantity.toFixed(2)));

  if (unit === "whole" || unit === "piece" || unit === "") {
    return `${quantityLabel} ${quantity === 1 ? name : pluraliseIngredient(name)}`;
  }
  return `${quantityLabel} ${formatUnit(unit, quantity)} ${name}`;
}

export function prepareManualShoppingItemName(name: string) {
  const normalised = name.trim().replace(/\s+/g, " ");
  if (normalised.length === 0) {
    throw new ShoppingListValidationError("Enter an item to add.");
  }
  if (normalised.length > SHOPPING_LIST_LIMITS.itemName) {
    throw new ShoppingListValidationError(
      `Shopping items must be ${SHOPPING_LIST_LIMITS.itemName} characters or fewer.`,
    );
  }
  return normalised;
}

export function normaliseIngredientName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function ingredientDetailLine(
  ingredient: RecipeIngredientLine,
  recipeTitle: string,
) {
  const amount = ingredientAmount(ingredient);
  const detail = [amount, ingredient.note]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" — ");

  return detail === "" ? recipeTitle : `${detail} · ${recipeTitle}`;
}

function ingredientAmount(ingredient: RecipeIngredientLine) {
  return [ingredient.quantity, ingredient.unit]
    .filter((value): value is string => value !== undefined)
    .join(" ");
}

function parseAmount(amount: string) {
  const match = amount.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;
  return {
    quantity: Number(match[1]),
    unit: normaliseUnit(match[2]?.trim().toLowerCase() ?? ""),
  };
}

function normaliseUnit(unit: string) {
  if (["tins", "cans", "cloves", "bunches", "heads"].includes(unit)) {
    return unit.endsWith("ches") ? unit.slice(0, -2) : unit.slice(0, -1);
  }
  return unit;
}

function formatUnit(unit: string, quantity: number) {
  if (quantity === 1) return unit;
  if (["tin", "can", "clove", "head"].includes(unit)) return `${unit}s`;
  if (unit === "bunch") return "bunches";
  return unit;
}

function pluraliseIngredient(name: string) {
  const lowerName = name.toLowerCase();
  if (
    lowerName.endsWith("s") ||
    lowerName === "broccoli" ||
    lowerName === "coriander" ||
    lowerName === "parsley"
  ) {
    return name;
  }
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}
