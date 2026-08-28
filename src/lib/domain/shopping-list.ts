import type { RecipeIngredientLine } from "./recipes";

export const SHOPPING_LIST_LIMITS = {
  items: 500,
  itemName: 160,
} as const;

export type ShoppingListRecipe<TRecipeId extends string = string> = {
  recipeId: TRecipeId;
  title: string;
  ingredients: readonly RecipeIngredientLine[];
};

export type DerivedShoppingListItem<TRecipeId extends string = string> = {
  name: string;
  detailLines: string[];
  sourceRecipeIds: TRecipeId[];
};

export class ShoppingListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShoppingListValidationError";
  }
}

export function deriveShoppingListItems<TRecipeId extends string>(
  recipes: readonly ShoppingListRecipe<TRecipeId>[],
): DerivedShoppingListItem<TRecipeId>[] {
  const itemsByName = new Map<string, DerivedShoppingListItem<TRecipeId>>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = normaliseIngredientName(ingredient.name);
      const existingItem = itemsByName.get(key);
      const detailLine = ingredientDetailLine(ingredient, recipe.title);

      if (existingItem === undefined) {
        itemsByName.set(key, {
          name: ingredient.name.trim(),
          detailLines: [detailLine],
          sourceRecipeIds: [recipe.recipeId],
        });
        continue;
      }

      existingItem.detailLines.push(detailLine);
      if (!existingItem.sourceRecipeIds.includes(recipe.recipeId)) {
        existingItem.sourceRecipeIds.push(recipe.recipeId);
      }
    }
  }

  return [...itemsByName.values()];
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

function normaliseIngredientName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function ingredientDetailLine(
  ingredient: RecipeIngredientLine,
  recipeTitle: string,
) {
  const amount = [ingredient.quantity, ingredient.unit]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  const detail = [amount, ingredient.note]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(" — ");

  return detail === "" ? recipeTitle : `${detail} · ${recipeTitle}`;
}
