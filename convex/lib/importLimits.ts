import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { importAllowanceWindow } from "../../src/lib/domain/entitlements";
import { requireFeature } from "./entitlements";

export const importRateLimiter = new RateLimiter(components.rateLimiter);

/** Called in the same transaction as enqueueing, after idempotency/validation. */
export async function consumeImportAttempt(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  importId: Id<"recipeImports">,
) {
  const { limits } = await requireFeature(ctx, ownerId, "recipeImport");
  // Include the job just queued by this transaction. Index reads serialize parallel starts.
  const active = await activeImportAttempts(
    ctx,
    ownerId,
    limits.simultaneousImports,
  );
  if (active.length > limits.simultaneousImports)
    throw new ConvexError({
      code: "IMPORT_CONCURRENCY_LIMIT",
      message: `You can import ${limits.simultaneousImports} recipes at a time. Wait for an import to finish, then try again.`,
      limit: limits.simultaneousImports,
    });
  if (!active.some((job) => job._id === importId))
    throw new Error("Import must be queued before allowance consumption.");
  await assertImportedRecipeCapacity(
    ctx,
    ownerId,
    limits.savedImportedRecipes,
    active.length,
  );
  const now = Date.now();
  const window = importAllowanceWindow(now);
  const config = {
    kind: "fixed window" as const,
    rate: limits.importAttemptsPerMonth,
    capacity: limits.importAttemptsPerMonth,
    period: window.end - window.start,
    start: window.start,
  };
  const usage = await ctx.db
    .query("accountImportUsage")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  let count = 1;
  if (
    usage?.windowStart !== window.start ||
    usage.allowance !== limits.importAttemptsPerMonth
  ) {
    // Preserve attempts already spent when a future verified grant changes tier mid-month.
    if (usage?.windowStart === window.start) {
      const previous = await importRateLimiter.getValue(
        ctx,
        "recipeImportAttempts",
        {
          key: ownerId,
          config: {
            ...config,
            rate: usage.allowance,
            capacity: usage.allowance,
          },
        },
      );
      count += Math.max(
        0,
        usage.allowance - (previous.value ?? usage.allowance),
      );
    }
    await importRateLimiter.reset(ctx, "recipeImportAttempts", {
      key: ownerId,
    });
    const values = {
      windowStart: window.start,
      allowance: limits.importAttemptsPerMonth,
    };
    if (usage) await ctx.db.patch(usage._id, values);
    else await ctx.db.insert("accountImportUsage", { ownerId, ...values });
  }
  const status =
    count <= limits.importAttemptsPerMonth
      ? await importRateLimiter.limit(ctx, "recipeImportAttempts", {
          key: ownerId,
          config,
          count,
        })
      : { ok: false };
  if (!status.ok)
    throw new ConvexError({
      code: "IMPORT_ALLOWANCE_EXHAUSTED",
      message: `You've used your ${limits.importAttemptsPerMonth} import attempts this month. Your allowance resets on ${new Date(window.end).toISOString().slice(0, 10)}.`,
      limit: limits.importAttemptsPerMonth,
      resetsAt: window.end,
    });
}

/** Count library membership, not private plan-only snapshots or household copies. */
export async function assertImportedRecipeCapacity(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  limit: number,
  reservations = 1,
) {
  const saved = await ctx.db
    .query("recipes")
    .withIndex("by_owner_and_source_and_saved_at", (q) =>
      q.eq("ownerId", ownerId).eq("source.type", "import").gt("savedAt", 0),
    )
    .take(limit + 1);
  if (saved.length + reservations > limit)
    throw new ConvexError({
      code: "IMPORTED_RECIPE_LIMIT",
      message: `Your library can hold ${limit} imported recipes. Remove an imported recipe before adding another.`,
      limit,
    });
}

export async function activeImportAttempts(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  limit: number,
) {
  return (
    await Promise.all(
      (["queued", "processing"] as const).map((status) =>
        ctx.db
          .query("recipeImports")
          .withIndex("by_owner_and_status", (q) =>
            q.eq("ownerId", ownerId).eq("status", status),
          )
          .take(limit + 1),
      ),
    )
  ).flat();
}
