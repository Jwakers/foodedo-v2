import { AuthControls } from "@/components/auth-controls";
import { StandardCatalogue } from "@/features/capture/standard-catalogue";
import { GuestDecide } from "@/features/decide/guest-decide";
import { CurrentPlanErrorBoundary } from "@/features/plan/current-plan-error-boundary";

export default function Home() {
  return (
    <main className="mx-auto min-h-full w-full max-w-4xl px-6 pb-20 pt-[max(2rem,env(safe-area-inset-top))] sm:px-10">
      <header className="flex min-h-14 items-start justify-between gap-6 border-b border-border pb-5">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-foreground">
          Foodedo
        </h1>
        <AuthControls />
      </header>

      <CurrentPlanErrorBoundary>
        <GuestDecide />
      </CurrentPlanErrorBoundary>
      <StandardCatalogue />
    </main>
  );
}
