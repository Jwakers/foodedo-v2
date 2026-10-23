"use client";

import { useEffect, useState } from "react";
import { useOnboarding } from "@/features/onboarding/use-onboarding";
import { ArrowRight, Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

/**
 * Successful plan save — confirms the durable week before returning to Week.
 * See `src/features/shop/README.md` discovery contract.
 */
export function PlanSavedSuccess({
  summary,
  firstSave,
}: {
  summary: string;
  firstSave: boolean;
}) {
  // Capture this visit before retiring the introduction. Reactive account updates
  // must not collapse the message while someone is reading it.
  const [introduceShopping] = useState(firstSave);
  const { retire } = useOnboarding();
  useEffect(() => {
    if (introduceShopping) retire("shopping");
  }, [introduceShopping, retire]);
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
          Your plan is saved
        </h1>
        <p className="mt-2 text-15 text-graphite">{summary}</p>
        <p className="mt-3 text-14 leading-5.5 text-graphite">
          You can swap or remove meals in the Week tab.
        </p>
      </div>

      {introduceShopping ? (
        <>
          <section
            aria-label="Your shopping list is ready"
            className="mt-8 rounded-surface bg-leaf-soft p-4"
          >
            <h2 className="font-display text-24 leading-7 font-semibold tracking-card text-ink">
              Your shopping list is ready
            </h2>
            <p className="mt-2 text-15 leading-5.75 text-graphite">
              Ingredients from your planned meals, together in one list.
            </p>
            <ButtonLink href="/shop" className="mt-4 w-full">
              Open shopping list{" "}
              <ArrowRight aria-hidden="true" className="size-4.5" />
            </ButtonLink>
          </section>
          <p className="mt-6 text-center text-14 leading-5.5 text-graphite">
            Change your plan and the list updates with it.
          </p>
          <ButtonLink href="/week" variant="secondary" className="mt-4 w-full">
            Go to my week
          </ButtonLink>
        </>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          <ButtonLink href="/week">Go to my week</ButtonLink>
          <ButtonLink href="/shop" variant="secondary">
            Open shopping list
          </ButtonLink>
        </div>
      )}
    </main>
  );
}
