"use client";

import { useHomeEntryState } from "@/components/use-home-entry-state";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Welcome } from "@/features/welcome/welcome";

export function HomeEntry() {
  const state = useHomeEntryState();

  if (state === "loading") {
    return (
      <div
        className="min-h-[50vh] bg-paper"
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  if (state === "welcome") {
    return <Welcome />;
  }

  return (
    <main className="w-full px-page-inline py-8 sm:px-8 sm:py-12">
      <Dashboard />
    </main>
  );
}
