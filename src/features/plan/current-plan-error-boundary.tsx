"use client";

import { catchError, type ErrorInfo } from "next/error";
import { useEffect } from "react";

function CurrentPlanErrorFallback(_props: object, { error }: ErrorInfo) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="plan-error-heading" className="mt-14">
      <p className="text-xs font-bold tracking-[0.18em] text-danger uppercase">
        Decide · Plan unavailable
      </p>
      <h2
        id="plan-error-heading"
        className="mt-3 max-w-2xl font-display text-4xl leading-tight tracking-[-0.04em] text-foreground sm:text-5xl"
      >
        We couldn&apos;t load your plan.
      </h2>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
        Nothing has been changed. Your local draft remains on this device, and
        the recipe catalogue is still available below.
      </p>
    </section>
  );
}

export const CurrentPlanErrorBoundary = catchError(CurrentPlanErrorFallback);
