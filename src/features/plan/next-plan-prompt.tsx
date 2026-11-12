import type { ReactNode } from "react";

import {
  formatPlanDateRange,
  type NextPlanTiming,
} from "@/lib/domain/plan-display";

import { cn } from "@/lib/utils/cn";

export function NextPlanPrompt({
  children,
  className,
  plan,
  timing,
}: {
  plan: { startDate: string; endDate: string };
  timing: NextPlanTiming;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-surface bg-cadmium-soft p-4", className)}>
      <p className="mb-1.5 text-12 font-medium leading-4.5 text-graphite">
        {timing === "ended"
          ? "Your plan ran"
          : timing === "resolved"
            ? "All meals cooked or skipped ·"
            : "Your plan runs"}{" "}
        {formatPlanDateRange(plan)}
      </p>
      <h2 className="font-display text-22 font-semibold leading-6.5 text-ink">
        Ready for next week?
      </h2>
      <p className="mt-1.5 text-14 leading-5 text-graphite">
        Your current plan stays until you save a new one.
      </p>
      <div className="mt-3.5">{children}</div>
    </div>
  );
}
