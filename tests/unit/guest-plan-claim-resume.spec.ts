import { expect, test } from "@playwright/test";

import {
  canResumeGuestPlanClaim,
  clearHydratedGuestPlanDraft,
  resumePendingGuestPlanClaim,
  type CurrentPlanForGuestClaim,
} from "../../src/features/plan/guest-plan-claim-resume";
import {
  acceptGuestPlan,
  createGuestDraft,
  requestGuestPlanClaim,
  type GuestDraft,
} from "../../src/lib/domain/guest-draft";

const catalogueMeals = Array.from({ length: 7 }, (_, index) => ({
  catalogueMealId: `meal-${index + 1}`,
  catalogueVersion: 1,
}));

function pendingDraft({ completed = false }: { completed?: boolean } = {}) {
  const accepted = acceptGuestPlan(
    createGuestDraft({
      planStartDate: "2026-09-30",
      catalogueMeals,
      now: 1,
    }),
    2,
  );
  const pending = requestGuestPlanClaim(accepted, "claim_key_123456789", 3);
  if (!completed) return pending;

  return {
    ...pending,
    claim: { ...pending.claim!, completedAt: 4 },
  };
}

function currentPlanFromDraft(draft: GuestDraft): CurrentPlanForGuestClaim {
  return {
    startDate: draft.planStartDate,
    endDate: draft.mealChoices.at(-1)!.date,
    mealSlots: draft.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null
        ? []
        : [
            {
              date: choice.date,
              catalogueMealId: choice.catalogueMealId,
              catalogueVersion: choice.catalogueVersion,
            },
          ],
    ),
  };
}

function resumeDependencies({
  draft,
  currentPlan = null,
  claimResult = { status: "claimed", mealPlanId: "plan-1" } as const,
  clearError = false,
}: {
  draft: GuestDraft | null;
  currentPlan?: CurrentPlanForGuestClaim | null;
  claimResult?:
    | { status: "claimed"; mealPlanId: string }
    | { status: "already_claimed"; mealPlanId: string }
    | { status: "catalogue_unsupported" };
  clearError?: boolean;
}) {
  const calls = {
    read: 0,
    claim: 0,
    clear: 0,
    cancel: 0,
    successful: 0,
    cleanupFailure: 0,
    unsupported: 0,
  };
  return {
    calls,
    dependencies: {
      currentPlan,
      readDraft: async () => {
        calls.read += 1;
        return draft;
      },
      claimDraft: async () => {
        calls.claim += 1;
        return claimResult;
      },
      clearDraft: async () => {
        calls.clear += 1;
        if (clearError) throw new Error("IndexedDB unavailable");
        return true;
      },
      cancelClaim: async () => {
        calls.cancel += 1;
      },
      onSuccessfulClaim: () => {
        calls.successful += 1;
      },
      onCleanupFailure: () => {
        calls.cleanupFailure += 1;
      },
      onUnsupportedCatalogue: () => {
        calls.unsupported += 1;
      },
    },
  };
}

test("does not resume before Convex authentication, plan hydration, and catalogue readiness", () => {
  expect(
    canResumeGuestPlanClaim({
      isAuthenticated: false,
      currentPlanResolved: true,
      hasCatalogue: true,
      isResuming: false,
    }),
  ).toBe(false);
  expect(
    canResumeGuestPlanClaim({
      isAuthenticated: true,
      currentPlanResolved: false,
      hasCatalogue: true,
      isResuming: false,
    }),
  ).toBe(false);
  expect(
    canResumeGuestPlanClaim({
      isAuthenticated: true,
      currentPlanResolved: true,
      hasCatalogue: false,
      isResuming: false,
    }),
  ).toBe(false);
  expect(
    canResumeGuestPlanClaim({
      isAuthenticated: true,
      currentPlanResolved: true,
      hasCatalogue: true,
      isResuming: false,
    }),
  ).toBe(true);
});

test("clears a completed local claim without submitting it again", async () => {
  const { calls, dependencies } = resumeDependencies({
    draft: pendingDraft({ completed: true }),
  });

  await expect(resumePendingGuestPlanClaim(dependencies)).resolves.toBe(
    "cleared_completed_claim",
  );
  expect(calls).toMatchObject({ claim: 0, clear: 1, successful: 0 });
});

test("clears a matching hydrated plan and does not re-claim it", async () => {
  const draft = pendingDraft();
  const { calls, dependencies } = resumeDependencies({
    draft,
    currentPlan: currentPlanFromDraft(draft),
  });

  await expect(resumePendingGuestPlanClaim(dependencies)).resolves.toBe(
    "matched_current_plan",
  );
  expect(calls).toMatchObject({ claim: 0, clear: 1, successful: 1 });
});

test("claims a pending draft, handles idempotent retry, and still navigates after cleanup failure", async () => {
  const draft = pendingDraft();
  const first = resumeDependencies({
    draft,
    currentPlan: {
      ...currentPlanFromDraft(draft),
      startDate: "2026-09-23",
      endDate: "2026-09-29",
    },
  });
  await expect(resumePendingGuestPlanClaim(first.dependencies)).resolves.toBe(
    "claimed",
  );
  expect(first.calls).toMatchObject({ claim: 1, clear: 1, successful: 1 });

  const retry = resumeDependencies({
    draft: pendingDraft(),
    claimResult: { status: "already_claimed", mealPlanId: "plan-1" },
    clearError: true,
  });
  await expect(resumePendingGuestPlanClaim(retry.dependencies)).resolves.toBe(
    "already_claimed",
  );
  expect(retry.calls).toMatchObject({
    claim: 1,
    clear: 1,
    successful: 1,
    cleanupFailure: 1,
  });
});

test("cancels only the pending claim when the catalogue is unsupported", async () => {
  const { calls, dependencies } = resumeDependencies({
    draft: pendingDraft(),
    claimResult: { status: "catalogue_unsupported" },
  });

  await expect(resumePendingGuestPlanClaim(dependencies)).resolves.toBe(
    "catalogue_unsupported",
  );
  expect(calls).toMatchObject({
    claim: 1,
    clear: 0,
    cancel: 1,
    successful: 0,
    unsupported: 1,
  });
});

test("hydrates cleanup only when the stored draft exactly matches the account plan", async () => {
  const draft = pendingDraft();
  const matchingPlan = currentPlanFromDraft(draft);
  let cleared = 0;
  await expect(
    clearHydratedGuestPlanDraft({
      currentPlan: matchingPlan,
      readDraft: async () => draft,
      clearDraft: async () => {
        cleared += 1;
        return true;
      },
    }),
  ).resolves.toBe(true);
  expect(cleared).toBe(1);

  await expect(
    clearHydratedGuestPlanDraft({
      currentPlan: { ...matchingPlan, startDate: "2026-10-01" },
      readDraft: async () => draft,
      clearDraft: async () => true,
    }),
  ).resolves.toBe(false);
});
