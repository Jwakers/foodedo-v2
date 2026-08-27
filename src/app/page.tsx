import { GuestDecide } from "@/features/decide/guest-decide";
import { CurrentPlanErrorBoundary } from "@/features/plan/current-plan-error-boundary";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-28 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:px-10">
      <CurrentPlanErrorBoundary>
        <GuestDecide />
      </CurrentPlanErrorBoundary>
    </main>
  );
}
