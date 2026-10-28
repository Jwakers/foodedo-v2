// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import { getFunctionName } from "convex/server";
import { createGuestDraft } from "@/lib/domain/guest-draft";
import { trackClaimedPlan } from "@/features/plan/plan-save-analytics";
import { ReplanReview } from "@/features/plan/replan-review";

const state = vi.hoisted(() => ({
  track: vi.fn(),
  apply: vi.fn(),
  undo: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ trackPlanSaved: state.track }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({ plan: "old-plan", revision: "1", space: "space-a" }),
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("@/features/auth/use-foodedo-auth", () => ({
  useFoodedoAuth: () => ({
    status: "authenticated",
    isAuthenticated: true,
    userId: "actor",
  }),
}));
vi.mock("@/features/household/household-context", () => ({
  useHouseholdSpace: () => ({
    spaceArgs: {},
    ready: true,
    isHousehold: false,
    spaceKey: "space-a",
  }),
}));
vi.mock("@/lib/platform/draft-space", () => ({
  getDraftSpaceKey: () => "space-a",
}));
vi.mock("@/features/recipes/use-catalogue", () => ({
  useCurrentCatalogue: () => ({ meals: [] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "mealPlans:getRegenerationProposal"
      ? {
          status: "ready",
          sourcePlanId: "old-plan",
          sourceUpdatedAt: 1,
          variant: 1,
          mealSlots: [1, 2].map((day) => ({
            date: `2030-01-0${day}`,
            title: "Dinner",
            previousTitle: "Previous dinner",
            isChanged: true,
            catalogueMealId: null,
          })),
        }
      : {
          _id: "old-plan",
          startDate: "2030-01-01",
          endDate: "2030-01-03",
          servings: 2,
          mealSlots: [],
        },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "mealPlans:applyRegenerationProposal"
      ? state.apply
      : state.undo,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

for (const requestedAsGuest of [true, false, undefined]) {
  test(`confirmed claim uses explicit origin ${requestedAsGuest}, independently of reviewSource`, () => {
    const draft = createGuestDraft({
      planStartDate: "2030-01-01",
      catalogueMeals: [{ catalogueMealId: "dinner", catalogueVersion: 1 }],
      now: 1,
    });
    draft.claim = {
      key: "claim-key-123456789",
      requestedAt: 2,
      ...(requestedAsGuest === undefined ? {} : { requestedAsGuest }),
    };
    // Deliberately contradict the old heuristic.
    if (requestedAsGuest)
      draft.reviewSource = { spaceKey: "space-a", planId: null };
    trackClaimedPlan(
      { status: "claimed", mealPlanId: "new-plan" },
      draft,
      "actor",
    );
    expect(state.track).toHaveBeenCalledExactlyOnceWith(
      "new-plan",
      {
        meal_count: draft.mealChoices.filter(
          (meal) => meal.catalogueMealId !== null,
        ).length,
        ...(requestedAsGuest === undefined
          ? {}
          : { is_guest_claim: requestedAsGuest }),
      },
      "actor",
    );
  });
}
test("unsupported claims do not emit a saved event", () => {
  const draft = createGuestDraft({
    planStartDate: "2030-01-01",
    catalogueMeals: [{ catalogueMealId: "dinner", catalogueVersion: 1 }],
    now: 1,
  });
  trackClaimedPlan({ status: "catalogue_unsupported" }, draft, "actor");
  expect(state.track).not.toHaveBeenCalled();
});

function saveClick(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child))
      continue;
    if (child.props.children === "Replace private week")
      return child.props.onClick;
    const found = saveClick(child.props.children);
    if (found) return found;
  }
}

test("signed-in replacement emits only after a confirmed mutation, with the actual occupied meal count", async () => {
  let resolve!: (result: unknown) => void;
  state.apply.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const click = saveClick(ReplanReview());
  expect(click).toBeTypeOf("function");
  click!();
  expect(state.track).not.toHaveBeenCalled();
  resolve({
    status: "applied",
    mealPlanId: "replacement",
    previousMealPlanId: "old-plan",
    currentUpdatedAt: 2,
  });
  await vi.waitFor(() =>
    expect(state.track).toHaveBeenCalledExactlyOnceWith(
      "replacement",
      { is_guest_claim: false, meal_count: 2 },
      "actor",
    ),
  );
});
for (const status of [
  "plan_changed",
  "no_active_plan",
  "plan_unavailable",
  "throw",
]) {
  test(`replacement ${status} does not count as a save`, async () => {
    if (status === "throw") state.apply.mockRejectedValue(new Error("failure"));
    else state.apply.mockResolvedValue({ status });
    saveClick(ReplanReview())!();
    await new Promise((resolve) => setImmediate(resolve));
    expect(state.track).not.toHaveBeenCalled();
  });
}
