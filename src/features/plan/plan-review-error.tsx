"use client";

import { Button } from "@/components/ui/button";

export function PlanReviewError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <main
      aria-labelledby="plan-error-heading"
      className="mx-auto flex w-full max-w-175 flex-col gap-4 px-page-inline pt-4.5 pb-8"
    >
      <div className="flex flex-col gap-1.5">
        <h1
          id="plan-error-heading"
          className="font-display text-30 font-semibold tracking-title text-ink"
        >
          Couldn’t open your week
        </h1>
        <p className="text-14 text-danger">{message}</p>
      </div>
      <Button className="w-full" onClick={() => void onRetry()}>
        Try again
      </Button>
    </main>
  );
}
