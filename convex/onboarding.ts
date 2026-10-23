import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUserId } from "./lib/auth";
import {
  introductionIdValidator,
  onboardingStateValidator,
  readOnboardingState,
  retireIntroductions,
} from "./lib/onboarding";

// Scope the subscription and queued writes to the initiating Clerk account.
export const getState = query({
  args: { authSubject: v.string() },
  returns: v.union(onboardingStateValidator, v.null()),
  handler: async (ctx, { authSubject }) => {
    const user = await getCurrentUser(ctx);
    if (!user || user.authSubject !== authSubject) return null;
    return await readOnboardingState(ctx, user._id);
  },
});

export const retire = mutation({
  args: {
    authSubject: v.string(),
    introductions: v.array(introductionIdValidator),
  },
  returns: v.null(),
  handler: async (ctx, { authSubject, introductions }) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get(userId);
    if (user?.authSubject !== authSubject)
      throw new ConvexError(
        "The account changed before this introduction could sync.",
      );
    await retireIntroductions(ctx, userId, introductions);
    return null;
  },
});
