import {
  applyGuestPlanEmptySlots,
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

function guestDraftStore(): GuestDraftStore {
  return createIndexedDbGuestDraftStore();
}

export async function readCurrentGuestPlanDraft(
  store: GuestDraftStore = guestDraftStore(),
): Promise<GuestDraftV1 | null> {
  return readGuestDraftV1(await store.read(), {
    catalogueVersion: standardCatalogue.version,
    catalogueMealIds,
  });
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
  const existing = await readCurrentGuestPlanDraft(store);
  if (existing) return existing;

  const draft = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate,
    catalogueMealIds,
    now,
    emptySlotIndexes: generationFreeDayIndexes,
  });

  await store.write(draft);
  return draft;
}

export async function shuffleCurrentGuestPlanDraft({
  now = Date.now(),
  store = guestDraftStore(),
}: {
  now?: number;
  store?: GuestDraftStore;
} = {}): Promise<GuestDraftV1> {
  const existing = await ensureGuestPlanDraft({ now, store });
  const shuffled = shuffleGuestPlan(existing, catalogueMealIds, now);
  // Re-apply generation free-day so older full drafts pick up the policy.
  const withFreeDay = applyGuestPlanEmptySlots(
    shuffled,
    generationFreeDayIndexes,
    now,
  );
  await store.write(withFreeDay);
  return withFreeDay;
}
