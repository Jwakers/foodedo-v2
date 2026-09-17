import {
  deriveShoppingListItems,
  shoppingItemIdentityKey,
  SHOPPING_LIST_LIMITS,
} from "../../src/lib/domain/shopping-list";
import { scaleIngredients } from "../../src/lib/domain/ingredient-scaling";
import type { RecipeIngredientLine } from "../../src/lib/domain/recipes";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const maximumPlanSlots = 31;
const maximumListsForOnePlan = 10;

/**
 * Marks an existing linked list archived without re-deriving its items.
 * Used when a plan is archived so Shop history stays consistent.
 */
export async function archiveShoppingListForPlan(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  mealPlanId: Id<"mealPlans">,
  updatedAt: number,
) {
  const lists = await ctx.db
    .query("shoppingLists")
    .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", mealPlanId))
    .order("desc")
    .take(maximumListsForOnePlan + 1);
  if (lists.length > maximumListsForOnePlan) {
    throw new Error("A meal plan has too many shopping lists to reconcile.");
  }

  for (const list of lists) {
    if (list.ownerId !== ownerId) continue;
    if (list.status === "archived") continue;
    await ctx.db.patch(list._id, { status: "archived", updatedAt });
  }
}

/**
 * Makes one plan's list match its current recipes while preserving explicit
 * user state on ingredients that still exist.
 */
export async function syncShoppingListForPlan(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  mealPlanId: Id<"mealPlans">,
) {
  const mealPlan = await ctx.db.get(mealPlanId);
  if (mealPlan === null || mealPlan.ownerId !== ownerId) {
    throw new Error("The meal plan is unavailable.");
  }

  const mealSlots = await ctx.db
    .query("mealSlots")
    .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlanId))
    .take(maximumPlanSlots + 1);
  if (mealSlots.length === 0 || mealSlots.length > maximumPlanSlots) {
    throw new Error("The meal plan cannot be turned into a shopping list.");
  }

  const recipes: Array<{
    recipeId: Id<"recipes">;
    title: string;
    date: string;
    ingredients: RecipeIngredientLine[];
  }> = [];
  for (const mealSlot of mealSlots) {
    const recipe = await ctx.db.get(mealSlot.recipeId);
    if (recipe === null || recipe.ownerId !== ownerId) {
      throw new Error("A planned recipe is unavailable.");
    }
    recipes.push({
      recipeId: recipe._id,
      title: recipe.title,
      date: mealSlot.date,
      ingredients: scaleIngredients(
        recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          shoppingCategory: ingredient.shoppingCategory ?? "other",
        })),
        recipe.servings,
        mealPlan.servings ?? 2,
      ),
    });
  }

  const derivedItems = deriveShoppingListItems(recipes);
  if (derivedItems.length > SHOPPING_LIST_LIMITS.items) {
    throw new Error("The shopping list exceeds the supported item limit.");
  }

  const lists = await ctx.db
    .query("shoppingLists")
    .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", mealPlanId))
    .order("desc")
    .take(maximumListsForOnePlan + 1);
  if (lists.length > maximumListsForOnePlan) {
    throw new Error("A meal plan has too many shopping lists to reconcile.");
  }

  const changedAt = Math.max(Date.now(), mealPlan.updatedAt);
  const shoppingListId =
    lists[0]?._id ??
    (await ctx.db.insert("shoppingLists", {
      ownerId,
      mealPlanId,
      mealPlanUpdatedAt: mealPlan.updatedAt,
      status: mealPlan.status,
      createdAt: changedAt,
      updatedAt: changedAt,
    }));

  const existingItems = await ctx.db
    .query("shoppingListItems")
    .withIndex("by_list_and_order", (q) =>
      q.eq("shoppingListId", shoppingListId),
    )
    .take(SHOPPING_LIST_LIMITS.items + 1);
  if (existingItems.length > SHOPPING_LIST_LIMITS.items) {
    throw new Error("The shopping list exceeds the supported item limit.");
  }

  const derivedByKey = new Map<string, Doc<"shoppingListItems">[]>();
  const manualItems: Doc<"shoppingListItems">[] = [];
  for (const item of existingItems) {
    if (item.origin === "manual") {
      manualItems.push(item);
      continue;
    }
    const key = shoppingItemIdentityKey(item.name, item.category ?? "other");
    const matchingItems = derivedByKey.get(key) ?? [];
    matchingItems.push(item);
    derivedByKey.set(key, matchingItems);
  }

  for (let order = 0; order < derivedItems.length; order += 1) {
    const nextItem = derivedItems[order]!;
    const key = shoppingItemIdentityKey(nextItem.name, nextItem.category);
    const matches = derivedByKey.get(key) ?? [];
    const existingItem = matches.shift();
    if (matches.length === 0) derivedByKey.delete(key);
    else derivedByKey.set(key, matches);

    if (existingItem === undefined) {
      await ctx.db.insert("shoppingListItems", {
        shoppingListId,
        ownerId,
        name: nextItem.name,
        displayName: nextItem.displayName,
        category: nextItem.category,
        detailLines: nextItem.detailLines,
        sourceRecipeIds: nextItem.sourceRecipeIds,
        sources: nextItem.sources,
        origin: "derived",
        checked: false,
        order,
        createdAt: changedAt,
        updatedAt: changedAt,
      });
      continue;
    }

    await ctx.db.patch(existingItem._id, {
      name: nextItem.name,
      displayName: nextItem.displayName,
      category: nextItem.category,
      detailLines: nextItem.detailLines,
      sourceRecipeIds: nextItem.sourceRecipeIds,
      sources: nextItem.sources,
      order,
      updatedAt: changedAt,
    });
  }

  for (const obsoleteItems of derivedByKey.values()) {
    for (const item of obsoleteItems) await ctx.db.delete(item._id);
  }

  manualItems.sort((a, b) => a.order - b.order);
  for (let index = 0; index < manualItems.length; index += 1) {
    await ctx.db.patch(manualItems[index]!._id, {
      order: derivedItems.length + index,
      updatedAt: changedAt,
    });
  }

  await ctx.db.patch(shoppingListId, {
    mealPlanUpdatedAt: mealPlan.updatedAt,
    status: mealPlan.status,
    updatedAt: changedAt,
  });

  for (const duplicateList of lists.slice(1)) {
    await deleteShoppingList(ctx, duplicateList._id);
  }

  return shoppingListId;
}

async function deleteShoppingList(
  ctx: MutationCtx,
  shoppingListId: Id<"shoppingLists">,
) {
  const items = await ctx.db
    .query("shoppingListItems")
    .withIndex("by_list_and_order", (q) =>
      q.eq("shoppingListId", shoppingListId),
    )
    .take(SHOPPING_LIST_LIMITS.items + 1);
  if (items.length > SHOPPING_LIST_LIMITS.items) {
    throw new Error("The shopping list exceeds the supported item limit.");
  }
  for (const item of items) await ctx.db.delete(item._id);
  await ctx.db.delete(shoppingListId);
}
