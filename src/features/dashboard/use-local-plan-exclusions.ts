"use client";

import { useEffect, useState } from "react";
import { readStoredGuestPlanDraft } from "@/features/plan/guest-plan-draft";
import { addDaysToPlanDate } from "@/lib/domain/guest-draft";
import { createIndexedDbGuestDraftStore } from "@/lib/platform/guest-draft-store";

type LocalPlanExclusions =
  | { status: "loading" }
  | { status: "ready"; mealIds: string[] }
  | { status: "error" };
const noLocalExclusions: LocalPlanExclusions = { status: "ready", mealIds: [] };

/** The server cannot read IndexedDB. Send it only this draft's catalogue IDs. */
export function useLocalPlanExclusions(
  enabled: boolean,
  spaceKey: string,
  day: string,
) {
  const [state, setState] = useState<LocalPlanExclusions>({
    status: "loading",
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const store = createIndexedDbGuestDraftStore(
      spaceKey === "guest" ? "current" : spaceKey,
    );
    void readStoredGuestPlanDraft(store)
      .then((draft) => {
        if (cancelled) return;
        const expired =
          draft &&
          addDaysToPlanDate(draft.planStartDate, draft.planDays - 1) < day;
        const completed = draft?.claim?.completedAt !== undefined;
        const mealIds =
          !draft || completed || expired
            ? []
            : draft.mealChoices.flatMap((choice) =>
                choice.catalogueMealId ? [choice.catalogueMealId] : [],
              );
        setState({ status: "ready", mealIds });
      })
      .catch((error) => {
        console.error("Failed to read local plan exclusions.", error);
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, spaceKey, day]);
  return enabled ? state : noLocalExclusions;
}
