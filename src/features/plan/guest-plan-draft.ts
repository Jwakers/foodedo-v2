import {
  applyGuestPlanEmptySlots,
  createGuestDraft,
  GUEST_PLAN_PREVIEW_EMPTY_SLOT_INDEX,
  readGuestDraftV1,
  shuffleGuestPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { tomorrowPlanDate } from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { createIndexedDbGuestDraftStore } from "@/lib/platform/guest-draft-store";

const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);
const previewEmptySlotIndexes = [GUEST_PLAN_PREVIEW_EMPTY_SLOT_INDEX] as const;

export async function readCurrentGuestPlanDraft(): Promise<GuestDraftV1 | null> {
  const store = createIndexedDbGuestDraftStore();
  return readGuestDraftV1(await store.read(), {
    catalogueVersion: standardCatalogue.version,
    catalogueMealIds,
  });
}

async function withPreviewEmptySlot(
  draft: GuestDraftV1,
  now: number,
): Promise<GuestDraftV1> {
  const withEmptySlot = applyGuestPlanEmptySlots(
    draft,
    previewEmptySlotIndexes,
    now,
  );
  if (withEmptySlot !== draft) {
    await createIndexedDbGuestDraftStore().write(withEmptySlot);
  }
  return withEmptySlot;
}

/** Loads the local draft for plan review, ensuring the preview free day exists. */
export async function loadGuestPlanDraftForReview({
  now = Date.now(),
}: {
  now?: number;
} = {}): Promise<GuestDraftV1 | null> {
  const existing = await readCurrentGuestPlanDraft();
  if (!existing) return null;
  return withPreviewEmptySlot(existing, now);
}

/**
 * Returns the current local guest draft, creating a fresh one when missing or
 * invalid. Generation stays on the transparent rotating catalogue order for now,
 * with one preview free day so plan review can show the empty-slot UI.
 */
export async function ensureGuestPlanDraft({
  now = Date.now(),
  planStartDate = tomorrowPlanDate(),
}: {
  now?: number;
  planStartDate?: string;
} = {}): Promise<GuestDraftV1> {
  const store = createIndexedDbGuestDraftStore();
  const existing = await readCurrentGuestPlanDraft();
  if (existing) {
    return withPreviewEmptySlot(existing, now);
  }

  const draft = createGuestDraft({
    catalogueVersion: standardCatalogue.version,
    planStartDate,
    catalogueMealIds,
    now,
    emptySlotIndexes: previewEmptySlotIndexes,
  });

  await store.write(draft);
  return draft;
}

export async function shuffleCurrentGuestPlanDraft({
  now = Date.now(),
}: {
  now?: number;
} = {}): Promise<GuestDraftV1> {
  const existing = await ensureGuestPlanDraft({ now });
  const shuffled = applyGuestPlanEmptySlots(
    shuffleGuestPlan(existing, catalogueMealIds, now),
    previewEmptySlotIndexes,
    now,
  );
  await createIndexedDbGuestDraftStore().write(shuffled);
  return shuffled;
}
