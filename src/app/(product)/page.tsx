import { HomeEntry } from "@/features/welcome/home-entry";
import { Suspense } from "react";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh]" aria-busy="true" aria-label="Loading" />
      }
    >
      <HomeEntry />
    </Suspense>
  );
}
