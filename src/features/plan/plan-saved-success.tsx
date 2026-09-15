"use client";

import { useAuth } from "@clerk/react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { markFirstSaveSuccessSeen } from "@/features/plan/plan-lifecycle-prefs";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

/**
 * First successfully saved plan — introduces Shopping once, then Week.
 * See `src/features/shop/README.md` discovery contract.
 */
export function PlanSavedSuccess({ summary }: { summary: string }) {
  const { userId } = useAuth();
  const router = useRouter();

  function goToWeek() {
    markFirstSaveSuccessSeen(userId);
    temporaryFeedback("Shopping list comes next.");
    router.replace("/week");
  }

  return (
    <main
      aria-labelledby="plan-saved-heading"
      className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-6 pb-10"
    >
      <p className="flex items-center gap-2 text-12 font-bold tracking-overline text-leaf uppercase">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-leaf"
        />
        Plan saved
      </p>

      <div className="mt-8 flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-leaf-soft text-leaf">
          <Check aria-hidden="true" className="size-7" strokeWidth={2.4} />
        </div>
        <h1
          id="plan-saved-heading"
          className="mt-5 font-display text-34 font-semibold tracking-title text-ink"
        >
          Your week is sorted
        </h1>
        <p className="mt-2 text-15 text-graphite">{summary}</p>
      </div>

      <div className="mt-8 rounded-surface bg-leaf-soft p-4">
        <div className="flex size-9 items-center justify-center rounded-full bg-leaf text-leaf-soft">
          <Check aria-hidden="true" className="size-4.5" strokeWidth={2.4} />
        </div>
        <p className="mt-3 font-display text-22 font-semibold text-ink">
          Shopping list coming soon
        </p>
        <p className="mt-1.5 text-14 leading-relaxed text-graphite">
          Your saved meals will be ready to turn into one list when Shopping is
          available.
        </p>
        <Button className="mt-4 w-full" onClick={goToWeek}>
          Continue to my week →
        </Button>
      </div>

      <p className="mt-4 text-center text-13 text-graphite">
        Your saved plan is ready whenever you come back.
      </p>
    </main>
  );
}
