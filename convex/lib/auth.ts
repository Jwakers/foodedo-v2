import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

type AuthContext = QueryCtx | MutationCtx;

export async function requireAuthSubject(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in to access personal Foodedo data.",
    });
  }

  return identity.subject;
}

export async function getCurrentUser(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
}
