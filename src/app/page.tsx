import { AuthControls } from "@/components/auth-controls";
import { StandardCatalogue } from "@/features/capture/standard-catalogue";

export default function Home() {
  return (
    <main className="mx-auto min-h-full w-full max-w-4xl px-6 pb-20 pt-[max(2rem,env(safe-area-inset-top))] sm:px-10">
      <header className="flex min-h-14 items-start justify-between gap-6 border-b border-[var(--line)] pb-5">
        <h1 className="font-serif text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
          Foodedo
        </h1>
        <AuthControls />
      </header>

      <div className="mt-14 max-w-2xl">
        <p className="text-sm font-semibold text-[var(--accent)]">
          Less deciding. More eating.
        </p>
        <p className="mt-4 font-serif text-3xl leading-tight tracking-[-0.02em] text-[var(--ink)] sm:text-4xl">
          Foodedo helps turn the daily question of what to eat into a practical
          next step.
        </p>
      </div>

      <StandardCatalogue />
    </main>
  );
}
