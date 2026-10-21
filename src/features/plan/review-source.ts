import { getDraftSpaceKey } from "@/lib/platform/draft-space";
import type { GuestDraft } from "@/lib/domain/guest-draft";
/** Captured before generation and persisted atomically with that exact draft. */
export function bindReviewSource(
  plan: { _id: string; updatedAt: number } | null,
): NonNullable<GuestDraft["reviewSource"]> {
  return {
    spaceKey: getDraftSpaceKey(),
    planId: plan?._id ?? null,
    ...(plan ? { updatedAt: plan.updatedAt } : {}),
  };
}
