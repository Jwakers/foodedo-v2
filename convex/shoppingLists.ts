import { recipeServingModel } from "../src/lib/domain/ingredient-scaling";
import { ConvexError, v } from "convex/values";
import {
  formatShoppingItemDisplayName,
  normaliseIngredientName,
  prepareManualShoppingItemName,
  SHOPPING_LIST_LIMITS,
  ShoppingListValidationError,
} from "../src/lib/domain/shopping-list";
import { normaliseImportedDisplayAmount } from "../src/lib/domain/recipe-normalization";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { readSpace, requireSpace, spaceArgs, type SpaceId } from "./lib/spaces";
import { shoppingCategoryValidator } from "./lib/recipeValidators";
import { syncShoppingListForPlan } from "./lib/shoppingListSync";

const maximumPlanSlots = 31;
const maximumRecentListCandidates = 30;
const maximumRecentShoppingLists = 12;
const shoppingTreatmentValidator = v.union(
  v.literal("required"),
  v.literal("staple"),
);

const shoppingListItemViewValidator = v.object({
  _id: v.id("shoppingListItems"),
  name: v.string(),
  displayName: v.string(),
  category: shoppingCategoryValidator,
  detailLines: v.array(v.string()),
  sources: v.array(
    v.object({
      recipeId: v.id("recipes"),
      recipeTitle: v.string(),
      requestedServings: v.optional(v.number()),
      date: v.union(v.string(), v.null()),
      amount: v.string(),
    }),
  ),
  origin: v.union(v.literal("derived"), v.literal("manual")),
  treatment: shoppingTreatmentValidator,
  included: v.boolean(),
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
    startDate: v.string(),
    endDate: v.string(),
    mealCount: v.number(),
    list: v.union(
      v.object({
        _id: v.id("shoppingLists"),
        mealPlanId: v.id("mealPlans"),
        startDate: v.string(),
        endDate: v.string(),
        mealCount: v.number(),
        needsSync: v.boolean(),
        items: v.array(shoppingListItemViewValidator),
      }),
      v.null(),
    ),
  }),
);

const ensureResultValidator = v.union(
  v.object({
    status: v.literal("ready"),
    shoppingListId: v.id("shoppingLists"),
  }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("active_plan_conflict") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

const itemMutationResultValidator = v.union(
  v.object({ status: v.literal("updated") }),
  v.object({ status: v.literal("not_found") }),
);

const shoppingListSummaryValidator = v.object({
  _id: v.id("shoppingLists"),
  startDate: v.string(),
  endDate: v.string(),
  status: v.union(v.literal("active"), v.literal("archived")),
  itemCount: v.number(),
  checkedCount: v.number(),
  mealCount: v.number(),
  createdAt: v.number(),
});

const selectedShoppingListValidator = v.union(
  v.object({
    _id: v.id("shoppingLists"),
    mealPlanId: v.id("mealPlans"),
    startDate: v.string(),
    endDate: v.string(),
    mealCount: v.number(),
    status: v.union(v.literal("active"), v.literal("archived")),
    items: v.array(shoppingListItemViewValidator),
  }),
  v.null(),
);

export const getCurrent = query({
  args: { ...spaceArgs },
  returns: currentShoppingListValidator,
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return { status: "no_active_plan" } as const;
    const activePlans = await getActivePlans(ctx, ownerId);
    if (activePlans.length === 0) {
      return { status: "no_active_plan" } as const;
    }
    if (activePlans.length > 1) {
      return { status: "active_plan_conflict" } as const;
    }

    const mealPlan = activePlans[0]!;
    const planLists = await ctx.db
      .query("shoppingLists")
      .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", mealPlan._id))
      .order("desc")
      .take(2);
    const list = planLists[0];
    const mealSlots = await ctx.db
      .query("mealSlots")
      .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlan._id))
      .take(maximumPlanSlots + 1);
    if (mealSlots.length > maximumPlanSlots) {
      throw new Error("An active meal plan exceeds the supported slot limit.");
    }
    if (list === undefined) {
      return {
        status: "ready",
        currentMealPlanId: mealPlan._id,
        startDate: mealPlan.startDate,
        endDate: mealPlan.endDate,
        mealCount: mealSlots.length,
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
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      mealCount: mealSlots.length,
      list: {
        _id: list._id,
        mealPlanId: list.mealPlanId,
        startDate: mealPlan.startDate,
        endDate: mealPlan.endDate,
        mealCount: mealSlots.length,
        needsSync:
          planLists.length > 1 || list.mealPlanUpdatedAt !== mealPlan.updatedAt,
        items: await Promise.all(
          items.map((item) =>
            shoppingItemView(ctx, item, mealSlots, mealPlan.servings ?? 2),
          ),
        ),
      },
    } as const;
  },
});

/** Bounded metadata for the recent-list picker; full items load on selection. */
export const getRecentSummaries = query({
  args: { ...spaceArgs },
  returns: v.array(shoppingListSummaryValidator),
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return [];
    const retainedLists = await ctx.db
      .query("shoppingLists")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(maximumRecentListCandidates);
    const recentLists = [
      ...retainedLists
        .toSorted((a, b) => b.createdAt - a.createdAt)
        .reduce((byPlan, list) => {
          if (!byPlan.has(list.mealPlanId)) byPlan.set(list.mealPlanId, list);
          return byPlan;
        }, new Map<Id<"mealPlans">, Doc<"shoppingLists">>())
        .values(),
    ].slice(0, maximumRecentShoppingLists);

    const summaries = await Promise.all(
      recentLists.map(async (list) => {
        const [mealPlan, mealSlots, items] = await Promise.all([
          ctx.db.get(list.mealPlanId),
          ctx.db
            .query("mealSlots")
            .withIndex("by_plan_and_date", (q) =>
              q.eq("mealPlanId", list.mealPlanId),
            )
            .take(maximumPlanSlots + 1),
          ctx.db
            .query("shoppingListItems")
            .withIndex("by_list_and_order", (q) =>
              q.eq("shoppingListId", list._id),
            )
            .take(SHOPPING_LIST_LIMITS.items + 1),
        ]);
        if (items.length > SHOPPING_LIST_LIMITS.items) {
          throw new Error("A shopping list exceeds the supported item limit.");
        }
        if (mealSlots.length > maximumPlanSlots) {
          throw new Error("A meal plan exceeds the supported slot limit.");
        }
        if (mealPlan === null || mealPlan.ownerId !== ownerId) return null;

        return {
          _id: list._id,
          startDate: mealPlan.startDate,
          endDate: mealPlan.endDate,
          status: mealPlan.status,
          itemCount: items.filter(
            (item) => item.deletedAt === undefined && item.included,
          ).length,
          checkedCount: items.filter(
            (item) =>
              item.deletedAt === undefined && item.included && item.checked,
          ).length,
          mealCount: mealSlots.length,
          createdAt: list.createdAt,
        };
      }),
    );
    return summaries.filter((summary) => summary !== null);
  },
});

/** Hydrate one previous plan's list only after the user selects it. */
export const getById = query({
  args: { ...spaceArgs, shoppingListId: v.id("shoppingLists") },
  returns: selectedShoppingListValidator,
  handler: async (ctx, { shoppingListId, householdId }) => {
    const ownerId = await readSpace(ctx, householdId);
    if (ownerId === null) return null;
    const list = await ctx.db.get(shoppingListId);
    if (list === null || list.ownerId !== ownerId) return null;

    const mealPlan = await ctx.db.get(list.mealPlanId);
    if (mealPlan === null || mealPlan.ownerId !== ownerId) return null;

    const [items, mealSlots] = await Promise.all([
      ctx.db
        .query("shoppingListItems")
        .withIndex("by_list_and_order", (q) =>
          q.eq("shoppingListId", shoppingListId),
        )
        .take(SHOPPING_LIST_LIMITS.items + 1),
      ctx.db
        .query("mealSlots")
        .withIndex("by_plan_and_date", (q) =>
          q.eq("mealPlanId", list.mealPlanId),
        )
        .take(maximumPlanSlots + 1),
    ]);
    if (items.length > SHOPPING_LIST_LIMITS.items) {
      throw new Error("A shopping list exceeds the supported item limit.");
    }
    if (mealSlots.length > maximumPlanSlots) {
      throw new Error("A meal plan exceeds the supported slot limit.");
    }

    return {
      _id: list._id,
      mealPlanId: list.mealPlanId,
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      mealCount: mealSlots.length,
      status: mealPlan.status,
      items: await Promise.all(
        items.map((item) =>
          shoppingItemView(ctx, item, mealSlots, mealPlan.servings ?? 2),
        ),
      ),
    };
  },
});

export const ensureForCurrentPlan = mutation({
  args: { ...spaceArgs },
  returns: ensureResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
    const activePlans = await getActivePlans(ctx, ownerId);
    if (activePlans.length === 0) {
      return { status: "no_active_plan" } as const;
    }
    if (activePlans.length > 1) {
      return { status: "active_plan_conflict" } as const;
    }

    const mealPlan = activePlans[0]!;
    try {
      const shoppingListId = await syncShoppingListForPlan(
        ctx,
        ownerId,
        mealPlan._id,
      );
      return { status: "ready", shoppingListId } as const;
    } catch (error) {
      console.error("Failed to synchronize a shopping list.", error);
      return { status: "plan_unavailable" } as const;
    }
  },
});

export const setItemChecked = mutation({
  args: {
    ...spaceArgs,
    itemId: v.id("shoppingListItems"),
    checked: v.boolean(),
  },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId, checked, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const editableItem = await getEditableItem(ctx, itemId, ownerId);
    if (editableItem === null) return { status: "not_found" } as const;
    if (editableItem.item.included === false) {
      return { status: "not_found" } as const;
    }

    const updatedAt = Date.now();
    await ctx.db.patch(editableItem.item._id, { checked, updatedAt });
    await ctx.db.patch(editableItem.list._id, { updatedAt });
    return { status: "updated" } as const;
  },
});

export const setStapleIncluded = mutation({
  args: {
    ...spaceArgs,
    itemId: v.id("shoppingListItems"),
    included: v.boolean(),
  },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId, included, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const editableItem = await getEditableItem(ctx, itemId, ownerId);
    if (editableItem === null) return { status: "not_found" } as const;
    if (editableItem.item.treatment !== "staple") {
      return { status: "not_found" } as const;
    }

    const updatedAt = Date.now();
    await ctx.db.patch(editableItem.item._id, {
      treatment: "staple",
      included,
      ...(included ? {} : { checked: false }),
      updatedAt,
    });
    await ctx.db.patch(editableItem.list._id, { updatedAt });
    return { status: "updated" } as const;
  },
});

export const includeAllStaples = mutation({
  args: { ...spaceArgs, shoppingListId: v.id("shoppingLists") },
  returns: v.union(
    v.object({ status: v.literal("updated"), count: v.number() }),
    v.object({ status: v.literal("not_found") }),
  ),
  handler: async (ctx, { shoppingListId, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const list = await ctx.db.get(shoppingListId);
    if (list === null || list.ownerId !== ownerId) {
      return { status: "not_found" } as const;
    }
    const items = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_list_and_order", (q) =>
        q.eq("shoppingListId", shoppingListId),
      )
      .take(SHOPPING_LIST_LIMITS.items + 1);
    if (items.length > SHOPPING_LIST_LIMITS.items) {
      throw new Error("A shopping list exceeds the supported item limit.");
    }
    const staples = items.filter(
      (item) =>
        item.origin === "derived" &&
        item.treatment === "staple" &&
        item.deletedAt === undefined &&
        !item.included,
    );
    const updatedAt = Date.now();
    for (const item of staples) {
      await ctx.db.patch(item._id, {
        treatment: "staple",
        included: true,
        updatedAt,
      });
    }
    if (staples.length > 0) await ctx.db.patch(list._id, { updatedAt });
    return { status: "updated", count: staples.length } as const;
  },
});

export const addItem = mutation({
  args: {
    ...spaceArgs,
    shoppingListId: v.id("shoppingLists"),
    name: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("added"),
      itemId: v.id("shoppingListItems"),
    }),
    v.object({ status: v.literal("not_found") }),
    v.object({ status: v.literal("list_full") }),
  ),
  handler: async (ctx, { shoppingListId, name, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const list = await ctx.db.get(shoppingListId);
    if (list === null || list.ownerId !== ownerId) {
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
      ownerId,
      name: preparedName,
      detailLines: [],
      sourceRecipeIds: [],
      origin: "manual",
      treatment: "required",
      included: true,
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
  args: { ...spaceArgs, itemId: v.id("shoppingListItems") },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const editableItem = await getEditableItem(ctx, itemId, ownerId);
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
  args: { ...spaceArgs, itemId: v.id("shoppingListItems") },
  returns: itemMutationResultValidator,
  handler: async (ctx, { itemId, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const editableItem = await getEditableItem(ctx, itemId, ownerId);
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

async function getActivePlans(ctx: QueryCtx | MutationCtx, ownerId: SpaceId) {
  return await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .order("desc")
    .take(2);
}

async function getEditableItem(
  ctx: MutationCtx,
  itemId: Id<"shoppingListItems">,
  ownerId: SpaceId,
) {
  const item = await ctx.db.get(itemId);
  if (item === null || item.ownerId !== ownerId) return null;

  const list = await ctx.db.get(item.shoppingListId);
  if (list === null || list.ownerId !== ownerId) {
    return null;
  }
  return { item, list };
}

async function shoppingItemView(
  ctx: QueryCtx,
  item: Doc<"shoppingListItems">,
  mealSlots: Doc<"mealSlots">[],
  requestedServings: number,
) {
  const sources = (
    item.sources ??
    (await reconstructLegacySources(ctx, item, mealSlots, requestedServings))
  ).map((source) => ({
    ...source,
    requestedServings: source.requestedServings ?? requestedServings,
  }));
  return {
    _id: item._id,
    name: item.name,
    displayName:
      sources.length > 0
        ? formatShoppingItemDisplayName(item.name, sources)
        : (item.displayName ?? item.name),
    category: item.category ?? ("other" as const),
    detailLines: item.detailLines,
    sources,
    origin: item.origin,
    treatment: item.treatment,
    included: item.included,
    checked: item.checked,
    deletedAt: item.deletedAt ?? null,
    order: item.order,
  };
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

/**
 * Rebuilds per-occurrence sources for legacy items that only stored
 * deduplicated sourceRecipeIds. Walks meal slots so repeated recipes keep
 * A, A, B ordering instead of indexing the deduplicated ID list.
 */
async function reconstructLegacySources(
  ctx: QueryCtx,
  item: Doc<"shoppingListItems">,
  mealSlots: Doc<"mealSlots">[],
  requestedServings: number,
) {
  if (item.origin === "manual" || item.sourceRecipeIds.length === 0) {
    return [];
  }

  const itemName = normaliseIngredientName(item.name);
  const itemCategory = item.category ?? "other";
  const sources: Array<{
    recipeId: Id<"recipes">;
    recipeTitle: string;
    requestedServings?: number;
    date: string | null;
    amount: string;
  }> = [];

  for (const mealSlot of mealSlots) {
    const recipe = await ctx.db.get(mealSlot.recipeId);
    if (recipe === null) continue;
    if (recipe.ownerId !== item.ownerId) continue;
    const model = recipeServingModel(recipe, requestedServings);
    for (const ingredient of model.ingredients) {
      if (normaliseIngredientName(ingredient.name) !== itemName) continue;
      if ((ingredient.shoppingCategory ?? "other") !== itemCategory) continue;
      sources.push({
        recipeId: recipe._id,
        recipeTitle: recipe.title,
        requestedServings,
        date: mealSlot.date,
        amount: normaliseImportedDisplayAmount(ingredient) ?? "",
      });
    }
  }

  if (sources.length > 0) return sources;

  return item.detailLines
    .map((detailLine, index) => {
      const separatorIndex = detailLine.lastIndexOf(" · ");
      const amount =
        separatorIndex === -1 ? "" : detailLine.slice(0, separatorIndex);
      const recipeTitle =
        separatorIndex === -1
          ? detailLine
          : detailLine.slice(separatorIndex + 3);
      const recipeId =
        item.sourceRecipeIds[Math.min(index, item.sourceRecipeIds.length - 1)];
      if (recipeId === undefined) return null;
      return {
        recipeId,
        recipeTitle,
        requestedServings,
        date: null as string | null,
        amount,
      };
    })
    .filter((source) => source !== null);
}
