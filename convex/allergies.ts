import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { requireSpace, spaceArgs } from "./lib/spaces";
import { allergyProfile, effectiveAllergies } from "./lib/allergies";
import { validAllergyIds } from "../src/lib/domain/allergies";

export const getCurrent = query({
  args: spaceArgs,
  returns: v.object({
    allergenIds: v.array(v.string()),
    effectiveIds: v.array(v.string()),
    shareWithHousehold: v.boolean(),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const spaceId = await requireSpace(ctx, args.householdId);
    const profile = await allergyProfile(ctx, await requireUserId(ctx));
    return {
      allergenIds: profile?.allergenIds ?? [],
      shareWithHousehold: profile?.shareWithHousehold ?? false,
      revision: profile?.revision ?? 0,
      effectiveIds: await effectiveAllergies(ctx, spaceId),
    };
  },
});
export const save = mutation({
  args: {
    allergenIds: v.array(v.string()),
    shareWithHousehold: v.boolean(),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const ids = validAllergyIds(args.allergenIds);
    if (
      args.allergenIds.length > 30 ||
      ids.length !== new Set(args.allergenIds).size
    )
      throw new ConvexError("Choose an allergy from the search results.");
    const current = await allergyProfile(ctx, ownerId);
    if ((current?.revision ?? 0) !== args.expectedRevision)
      throw new ConvexError(
        "Your saved allergies changed elsewhere. Close and reopen Allergies to review them before saving.",
      );
    const values = {
      allergenIds: ids,
      shareWithHousehold: args.shareWithHousehold,
      revision: args.expectedRevision + 1,
    };
    if (current) await ctx.db.patch(current._id, values);
    else await ctx.db.insert("allergyProfiles", { ownerId, ...values });
    return null;
  },
});
