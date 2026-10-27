"use client";

import { useHomeEntryState } from "@/components/use-home-entry-state";
import { Dashboard } from "@/features/dashboard/dashboard";
import { Welcome } from "@/features/welcome/welcome";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { enterGuestExperience } from "@/components/use-welcome-session";

function GuestEntryIntent() {
  const guestEntry = useSearchParams().get("try") === "1";

  useEffect(() => {
    if (!guestEntry) return;
    enterGuestExperience();
    const url = new URL(window.location.href);
    url.searchParams.delete("try");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [guestEntry]);

  return null;
}

export function HomeEntry() {
  const state = useHomeEntryState();
  return (
    <>
      <Suspense fallback={null}>
        <GuestEntryIntent />
      </Suspense>
      {state === "home" ? <HomeDashboard /> : <Welcome />}
    </>
  );
}

function HomeDashboard() {
  return (
    <main className="w-full px-page-inline py-8 sm:px-8 sm:py-12">
      <Dashboard />
    </main>
  );
}
