import {
  applyGuestPlanEmptySlots,
  clearGuestPlanMeal,
  createGuestDraft,
  readGuestDraftV1,
  shuffleGuestPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { tomorrowPlanDate } from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import {
  createIndexedDbGuestDraftStore,
  type GuestDraftStore,
} from "@/lib/platform/guest-draft-store";

const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);

/**
 * Temporary generation policy: leave one free day so plan review can exercise
 * empty-slot UI. Owned by the plan feature, not domain persistence.
 */
export const GUEST_PLAN_GENERATION_FREE_DAY_INDEX = 2 as const;

const generationFreeDayIndexes = [
  GUEST_PLAN_GENERATION_FREE_DAY_INDEX,
] as const;

const missingDraftMessage = "There is no guest plan on this device to update.";

function guestDraftStore(): GuestDraftStore {
  return createIndexedDbGuestDraftStore();
}

function parseGuestDraft(raw: unknown): GuestDraftV1 | null {
  return readGuestDraftV1(raw, {
    catalogueVersion: standardCatalogue.version,
    catalogueMealIds,
  });
}

export async function readCurrentGuestPlanDraft(
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return parseGuestDraft(await store.read());
}

/** Read-only load for plan review. Does not rewrite storage. */
export async function loadGuestPlanDraftForReview(
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return readCurrentGuestPlanDraft(store);
}

/**
 * Returns the current local guest draft, creating one when missing or invalid.
 * New plans use the temporary free-day generation policy.
 */
export async function ensureGuestPlanDraft({
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
  store = guestDraftStore(),
}: {
  now?: number;
  planStartDate?: string;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (existing) return { draft: existing, write: false };

    return {
      draft: createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate,
        catalogueMealIds,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      }),
      write: true,
    };
  });
}

export async function shuffleCurrentGuestPlanDraft({
  now = Date.now(),
  store = guestDraftStore(),
}: {
  now?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing =
      parseGuestDraft(raw) ??
      createGuestDraft({
        catalogueVersion: standardCatalogue.version,
        planStartDate: tomorrowPlanDate(),
        catalogueMealIds,
        now,
        emptySlotIndexes: generationFreeDayIndexes,
      });
    const shuffled = shuffleGuestPlan(existing, catalogueMealIds, now);
    // Re-apply generation free-day so older full drafts pick up the policy.
    const withFreeDay = applyGuestPlanEmptySlots(
      shuffled,
      generationFreeDayIndexes,
      now,
    );
    return { draft: withFreeDay, write: true };
  });
}

export async function removeGuestPlanMeal({
  date,
  now = Date.now(),
  store = guestDraftStore(),
}: {
  date: string;
  now?: number;
  store?: GuestDraftStore;
}): Promise<GuestDraftV1> {
  return store.runMutation((raw) => {
    const existing = parseGuestDraft(raw);
    if (!existing) {
      throw new Error(missingDraftMessage);
    }

    return {
      draft: clearGuestPlanMeal(existing, date, now),
      write: true,
    };
  });
}
