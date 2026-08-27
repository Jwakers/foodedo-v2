import { ConvexError, v } from "convex/values";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
  GUEST_PLAN_DAYS,
  isGuestClaimKey,
  isPlanDate,
} from "../src/lib/domain/guest-draft";
import {
  findStandardCatalogueMeal,
  standardCatalogue,
} from "../src/lib/domain/standard-catalogue";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuthSubject } from "./lib/auth";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";

const maximumPlanSlots = 31;

const mealSlotViewValidator = v.object({
  _id: v.id("mealSlots"),
  date: v.string(),
  recipeId: v.id("recipes"),
  isAvailable: v.boolean(),
  catalogueMealId: v.union(v.string(), v.null()),
  title: v.string(),
  prepMinutes: v.union(v.number(), v.null()),
  cookMinutes: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("planned"),
    v.literal("cooked"),
    v.literal("skipped"),
  ),
});

const mealPlanViewValidator = v.object({
  _id: v.id("mealPlans"),
  startDate: v.string(),
  endDate: v.string(),
  status: v.literal("active"),
  mealSlots: v.array(mealSlotViewValidator),
});

const mealChoiceValidator = v.object({
  date: v.string(),
  catalogueMealId: v.string(),
});

const claimResultValidator = v.union(
  v.object({
    status: v.literal("claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({
    status: v.literal("already_claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({
    status: v.literal("date_conflict"),
    dates: v.array(v.string()),
  }),
  v.object({ status: v.literal("catalogue_unsupported") }),
);

export const getCurrent = query({
  args: {},
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const mealPlan = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerSubject", ownerSubject).eq("status", "active"),
      )
      .order("desc")
      .first();

    if (mealPlan === null) return null;

    const mealSlots = await ctx.db
      .query("mealSlots")
      .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlan._id))
      .take(maximumPlanSlots + 1);

    if (mealSlots.length > maximumPlanSlots) {
      throw new Error("A meal plan exceeds the supported number of meals.");
    }

    const mealSlotViews = [];
    for (const mealSlot of mealSlots) {
      const recipe = await ctx.db.get(mealSlot.recipeId);
      if (recipe === null || recipe.ownerSubject !== ownerSubject) {
        mealSlotViews.push({
          _id: mealSlot._id,
          date: mealSlot.date,
          recipeId: mealSlot.recipeId,
          isAvailable: false,
          catalogueMealId: null,
          title: "Recipe unavailable",
          prepMinutes: null,
          cookMinutes: null,
          status: mealSlot.status,
        });
        continue;
      }

      mealSlotViews.push({
        _id: mealSlot._id,
        date: mealSlot.date,
        recipeId: recipe._id,
        isAvailable: true,
        catalogueMealId:
          recipe.source.type === "catalogue"
            ? recipe.source.catalogueMealId
            : null,
        title: recipe.title,
        prepMinutes: recipe.prepMinutes ?? null,
        cookMinutes: recipe.cookMinutes ?? null,
        status: mealSlot.status,
      });
    }

    return {
      _id: mealPlan._id,
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      status: "active" as const,
      mealSlots: mealSlotViews,
    };
  },
});

export const claimGuestDraft = mutation({
  args: {
    claimKey: v.string(),
    schemaVersion: v.literal(GUEST_DRAFT_SCHEMA_VERSION),
    catalogueVersion: v.number(),
    planStartDate: v.string(),
    mealChoices: v.array(mealChoiceValidator),
  },
  returns: claimResultValidator,
  handler: async (
    ctx,
    { claimKey, catalogueVersion, planStartDate, mealChoices },
  ) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const validation = validateGuestPlan({
      claimKey,
      catalogueVersion,
      planStartDate,
      mealChoices,
    });
    const existingClaim = await ctx.db
      .query("guestClaims")
      .withIndex("by_owner_and_claim_key", (q) =>
        q.eq("ownerSubject", ownerSubject).eq("claimKey", claimKey),
      )
      .unique();

    if (existingClaim !== null) {
      return {
        status: "already_claimed" as const,
        mealPlanId: existingClaim.mealPlanId,
      };
    }
    if (validation === "catalogue_unsupported") {
      return { status: "catalogue_unsupported" } as const;
    }

    const conflictingDates: string[] = [];
    for (const choice of mealChoices) {
      const existingSlot = await ctx.db
        .query("mealSlots")
        .withIndex("by_owner_and_date", (q) =>
          q.eq("ownerSubject", ownerSubject).eq("date", choice.date),
        )
        .unique();

      if (existingSlot !== null) {
        conflictingDates.push(choice.date);
      }
    }
    if (conflictingDates.length > 0) {
      return { status: "date_conflict", dates: conflictingDates } as const;
    }

    const recipeIdByCatalogueMeal = new Map<string, Id<"recipes">>();
    const recipeIds: Array<Id<"recipes">> = [];

    for (const choice of mealChoices) {
      let recipeId = recipeIdByCatalogueMeal.get(choice.catalogueMealId);
      if (recipeId === undefined) {
        const recipe = await getOrCreateCatalogueRecipe(ctx, {
          ownerSubject,
          catalogueMealId: choice.catalogueMealId,
          catalogueVersion,
          saveToLibrary: false,
        });
        recipeId = recipe.recipeId;
        recipeIdByCatalogueMeal.set(choice.catalogueMealId, recipeId);
      }
      recipeIds.push(recipeId);
    }

    const claimedAt = Date.now();
    const mealPlanId = await ctx.db.insert("mealPlans", {
      ownerSubject,
      startDate: planStartDate,
      endDate: addDaysToPlanDate(planStartDate, GUEST_PLAN_DAYS - 1),
      status: "active",
      createdAt: claimedAt,
      updatedAt: claimedAt,
    });

    for (let index = 0; index < mealChoices.length; index += 1) {
      await ctx.db.insert("mealSlots", {
        mealPlanId,
        ownerSubject,
        date: mealChoices[index]!.date,
        recipeId: recipeIds[index]!,
        status: "planned",
        createdAt: claimedAt,
        updatedAt: claimedAt,
      });
    }

    await ctx.db.insert("guestClaims", {
      ownerSubject,
      claimKey,
      mealPlanId,
      claimedAt,
    });

    return { status: "claimed", mealPlanId } as const;
  },
});

function validateGuestPlan({
  claimKey,
  catalogueVersion,
  planStartDate,
  mealChoices,
}: {
  claimKey: string;
  catalogueVersion: number;
  planStartDate: string;
  mealChoices: Array<{ date: string; catalogueMealId: string }>;
}): "valid" | "catalogue_unsupported" {
  if (!isGuestClaimKey(claimKey)) {
    throwInvalidPlan("The plan claim key is invalid.");
  }
  if (!Number.isInteger(catalogueVersion) || catalogueVersion < 1) {
    throwInvalidPlan("The catalogue version is invalid.");
  }
  if (!isPlanDate(planStartDate) || mealChoices.length !== GUEST_PLAN_DAYS) {
    throwInvalidPlan("The plan must contain seven consecutive dates.");
  }

  for (let index = 0; index < mealChoices.length; index += 1) {
    const choice = mealChoices[index]!;
    if (choice.date !== addDaysToPlanDate(planStartDate, index)) {
      throwInvalidPlan("The plan contains an invalid date.");
    }
  }

  if (catalogueVersion !== standardCatalogue.version) {
    return "catalogue_unsupported";
  }

  for (const choice of mealChoices) {
    if (
      findStandardCatalogueMeal(choice.catalogueMealId, catalogueVersion) ===
      null
    ) {
      throwInvalidPlan("The plan contains an invalid catalogue meal.");
    }
  }

  return "valid";
}

function throwInvalidPlan(message: string): never {
  throw new ConvexError({ code: "INVALID_GUEST_PLAN", message });
}
