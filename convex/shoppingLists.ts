import { ConvexError, v } from "convex/values";
import {
  deriveShoppingListItems,
  prepareManualShoppingItemName,
  SHOPPING_LIST_LIMITS,
  ShoppingListValidationError,
} from "../src/lib/domain/shopping-list";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuthSubject } from "./lib/auth";

const maximumActiveListRecovery = 10;
const maximumPlanSlots = 31;
const maximumShoppingListsPerOwner = 30;
const shoppingListRetentionMs = 30 * 24 * 60 * 60 * 1_000;
const cleanupItemBatchSize = 100;

const shoppingListItemViewValidator = v.object({
  _id: v.id("shoppingListItems"),
  name: v.string(),
  detailLines: v.array(v.string()),
  origin: v.union(v.literal("derived"), v.literal("manual")),
  checked: v.boolean(),
  deletedAt: v.union(v.number(), v.null()),
  order: v.number(),
});

const currentShoppingListValidator = v.union(
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("active_plan_conflict") }),
  v.object({
    status: v.literal("ready"),
    currentMealPlanId: v.id("mealPlans"),
    list: v.union(
      v.object({
        _id: v.id("shoppingLists"),
        mealPlanId: v.id("mealPlans"),
        isOutOfDate: v.boolean(),
        hasActiveListConflict: v.boolean(),
        items: v.array(shoppingListItemViewValidator),
      }),
      v.null(),
    ),
  }),
);

const generateResultValidator = v.union(
  v.object({
    status: v.literal("generated"),
    shoppingListId: v.id("shoppingLists"),
  }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("active_plan_conflict") }),
  v.object({ status: v.literal("plan_unavailable") }),
  v.object({ status: v.literal("list_too_large") }),
  v.object({ status: v.literal("too_many_active_lists") }),
);

const itemMutationResultValidator = v.union(
  v.object({ status: v.literal("updated") }),
  v.object({ status: v.literal("not_found") }),
);

export const getCurrent = query({
  args: {},
  returns: currentShoppingListValidator,
  handler: async (ctx) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const activePlans = await getActivePlans(ctx, ownerSubject);
    if (activePlans.length === 0) {
      return { status: "no_active_plan" } as const;
    }
    if (activePlans.length > 1) {
      return { status: "active_plan_conflict" } as const;
    }

    const mealPlan = activePlans[0]!;
    const activeLists = await getActiveLists(ctx, ownerSubject);
    const list = activeLists[0];
    if (list === undefined) {
      return {
        status: "ready",
        currentMealPlanId: mealPlan._id,
        list: null,
      } as const;
    }

    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list_and_order", (q) => q.eq("shoppingListId", list._id))
      .take(SHOPPING_LIST_LIMITS.items + 1);
    if (items.length > SHOPPING_LIST_LIMITS.items) {
      throw new Error("A shopping list exceeds the supported item limit.");
    }

    return {
      status: "ready",
      currentMealPlanId: mealPlan._id,
      list: {
        _id: list._id,
        mealPlanId: list.mealPlanId,
        isOutOfDate:
          list.mealPlanId !== mealPlan._id ||
          list.mealPlanUpdatedAt !== mealPlan.updatedAt,
        hasActiveListConflict: activeLists.length > 1,
        items: items.map((item) => ({
          _id: item._id,
          name: item.name,
          detailLines: item.detailLines,
          origin: item.origin,
          checked: item.checked,
          deletedAt: item.deletedAt ?? null,
          order: item.order,
        })),
      },
    } as const;
  },
});

export const generateFromCurrentPlan = mutation({
  args: {},
  returns: generateResultValidator,
  handler: async (ctx) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const activePlans = await getActivePlans(ctx, ownerSubject);
    if (activePlans.length === 0) {
      return { status: "no_active_plan" } as const;
    }
    if (activePlans.length > 1) {
      return { status: "active_plan_conflict" } as const;
    }

    const mealPlan = activePlans[0]!;
    const mealSlots = await ctx.db
      .query("mealSlots")
      .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlan._id))
      .take(maximumPlanSlots + 1);
    if (mealSlots.length === 0 || mealSlots.length > maximumPlanSlots) {
      return { status: "plan_unavailable" } as const;
    }

    const recipes: Array<{
      recipeId: Id<"recipes">;
      title: string;
      ingredients: Doc<"recipes">["ingredients"];
    }> = [];
    for (const mealSlot of mealSlots) {
      const recipe = await ctx.db.get(mealSlot.recipeId);
      if (recipe === null || recipe.ownerSubject !== ownerSubject) {
        return { status: "plan_unavailable" } as const;
      }
      recipes.push({
        recipeId: recipe._id,
        title: recipe.title,
        ingredients: recipe.ingredients,
      });
    }

    const derivedItems = deriveShoppingListItems(recipes);
    if (derivedItems.length > SHOPPING_LIST_LIMITS.items) {
      return { status: "list_too_large" } as const;
    }

    const activeLists = await getActiveLists(ctx, ownerSubject);
    if (activeLists.length > maximumActiveListRecovery) {
      return { status: "too_many_active_lists" } as const;
    }

    const updatedAt = Date.now();
    for (const activeList of activeLists) {
      await ctx.db.patch(activeList._id, { status: "archived", updatedAt });
    }

    const shoppingListId = await ctx.db.insert("shoppingLists", {
      ownerSubject,
      mealPlanId: mealPlan._id,
      mealPlanUpdatedAt: mealPlan.updatedAt,
      status: "active",
      createdAt: updatedAt,
      updatedAt,
    });

    for (let order = 0; order < derivedItems.length; order += 1) {
      const item = derivedItems[order]!;
      await ctx.db.insert("shoppingListItems", {
        shoppingListId,
        ownerSubject,
        name: item.name,
        detailLines: item.detailLines,
        sourceRecipeIds: item.sourceRecipeIds,
        origin: "derived",
        checked: false,
        deletedAt: undefined,
        order,
        createdAt: updatedAt,
        updatedAt,
      });
    }

    await enforceOwnerListLimit(ctx, ownerSubject, shoppingListId);

    return { status: "generated", shoppingListId } as const;
  },
});

export const setItemChecked = mutation({
  args: { itemId: v.id("shoppingListItems"), checked: v.boolean() },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId, checked }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const editableItem = await getEditableItem(ctx, itemId, ownerSubject);
    if (editableItem === null) return { status: "not_found" } as const;

    const updatedAt = Date.now();
    await ctx.db.patch(editableItem.item._id, { checked, updatedAt });
    await ctx.db.patch(editableItem.list._id, { updatedAt });
    return { status: "updated" } as const;
  },
});

export const addItem = mutation({
  args: { shoppingListId: v.id("shoppingLists"), name: v.string() },
  returns: v.union(
    v.object({
      status: v.literal("added"),
      itemId: v.id("shoppingListItems"),
    }),
    v.object({ status: v.literal("not_found") }),
    v.object({ status: v.literal("list_full") }),
  ),
  handler: async (ctx, { shoppingListId, name }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const list = await ctx.db.get(shoppingListId);
    if (
      list === null ||
      list.ownerSubject !== ownerSubject ||
      list.status !== "active"
    ) {
      return { status: "not_found" } as const;
    }

    const preparedName = prepareManualNameOrThrow(name);
    const existingItems = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list_and_order", (q) =>
        q.eq("shoppingListId", shoppingListId),
      )
      .order("desc")
      .take(SHOPPING_LIST_LIMITS.items);
    if (existingItems.length >= SHOPPING_LIST_LIMITS.items) {
      return { status: "list_full" } as const;
    }

    const updatedAt = Date.now();
    const itemId = await ctx.db.insert("shoppingListItems", {
      shoppingListId,
      ownerSubject,
      name: preparedName,
      detailLines: [],
      sourceRecipeIds: [],
      origin: "manual",
      checked: false,
      deletedAt: undefined,
      order: (existingItems[0]?.order ?? -1) + 1,
      createdAt: updatedAt,
      updatedAt,
    });
    await ctx.db.patch(list._id, { updatedAt });

    return { status: "added", itemId } as const;
  },
});

export const removeItem = mutation({
  args: { itemId: v.id("shoppingListItems") },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const editableItem = await getEditableItem(ctx, itemId, ownerSubject);
    if (editableItem === null) return { status: "not_found" } as const;

    const updatedAt = Date.now();
    await ctx.db.patch(editableItem.item._id, {
      deletedAt: updatedAt,
      updatedAt,
    });
    await ctx.db.patch(editableItem.list._id, { updatedAt });
    return { status: "updated" } as const;
  },
});

export const restoreItem = mutation({
  args: { itemId: v.id("shoppingListItems") },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const editableItem = await getEditableItem(ctx, itemId, ownerSubject);
    if (editableItem === null) return { status: "not_found" } as const;

    const updatedAt = Date.now();
    await ctx.db.patch(editableItem.item._id, {
      deletedAt: undefined,
      updatedAt,
    });
    await ctx.db.patch(editableItem.list._id, { updatedAt });
    return { status: "updated" } as const;
  },
});

export const deleteExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - shoppingListRetentionMs;
    const expiredList = await ctx.db
      .query("shoppingLists")
      .withIndex("by_updated_at", (q) => q.lt("updatedAt", cutoff))
      .first();
    if (expiredList === null) return null;

    await deleteListInBatches(ctx, expiredList._id);
    await ctx.scheduler.runAfter(0, internal.shoppingLists.deleteExpired, {});
    return null;
  },
});

async function getActivePlans(
  ctx: QueryCtx | MutationCtx,
  ownerSubject: string,
) {
  return await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerSubject", ownerSubject).eq("status", "active"),
    )
    .order("desc")
    .take(2);
}

async function getActiveLists(
  ctx: QueryCtx | MutationCtx,
  ownerSubject: string,
) {
  return await ctx.db
    .query("shoppingLists")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerSubject", ownerSubject).eq("status", "active"),
    )
    .order("desc")
    .take(maximumActiveListRecovery + 1);
}

async function getEditableItem(
  ctx: MutationCtx,
  itemId: Id<"shoppingListItems">,
  ownerSubject: string,
) {
  const item = await ctx.db.get(itemId);
  if (item === null || item.ownerSubject !== ownerSubject) return null;

  const list = await ctx.db.get(item.shoppingListId);
  if (
    list === null ||
    list.ownerSubject !== ownerSubject ||
    list.status !== "active"
  ) {
    return null;
  }
  return { item, list };
}

async function enforceOwnerListLimit(
  ctx: MutationCtx,
  ownerSubject: string,
  currentShoppingListId: Id<"shoppingLists">,
) {
  const retainedLists = await ctx.db
    .query("shoppingLists")
    .withIndex("by_owner_and_updated_at", (q) =>
      q.eq("ownerSubject", ownerSubject),
    )
    .order("desc")
    .take(maximumShoppingListsPerOwner + 1);
  const oldestOverflowList = retainedLists.at(-1);
  if (
    retainedLists.length <= maximumShoppingListsPerOwner ||
    oldestOverflowList === undefined ||
    oldestOverflowList._id === currentShoppingListId
  ) {
    return;
  }

  await deleteCompleteList(ctx, oldestOverflowList._id);
}

async function deleteCompleteList(
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
    throw new Error("A shopping list exceeds the supported item limit.");
  }
  for (const item of items) await ctx.db.delete(item._id);
  await ctx.db.delete(shoppingListId);
}

async function deleteListInBatches(
  ctx: MutationCtx,
  shoppingListId: Id<"shoppingLists">,
) {
  const items = await ctx.db
    .query("shoppingListItems")
    .withIndex("by_list_and_order", (q) =>
      q.eq("shoppingListId", shoppingListId),
    )
    .take(cleanupItemBatchSize + 1);
  const batch = items.slice(0, cleanupItemBatchSize);
  for (const item of batch) await ctx.db.delete(item._id);

  if (items.length > cleanupItemBatchSize) return;
  await ctx.db.delete(shoppingListId);
}

function prepareManualNameOrThrow(name: string) {
  try {
    return prepareManualShoppingItemName(name);
  } catch (error) {
    if (error instanceof ShoppingListValidationError) {
      throw new ConvexError({
        code: "INVALID_SHOPPING_ITEM",
        message: error.message,
      });
    }
    throw error;
  }
}
