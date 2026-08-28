import { CurrentPlanErrorBoundary } from "@/features/plan/current-plan-error-boundary";
import { PlanInterface } from "@/features/plan/plan-interface";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-28 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:px-10">
      <CurrentPlanErrorBoundary>
        <PlanInterface />
      </CurrentPlanErrorBoundary>
    </main>
  );
}
