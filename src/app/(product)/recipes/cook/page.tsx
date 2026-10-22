import type { Metadata } from "next";
import { Suspense } from "react";

import { CookModeRoute } from "@/features/cook/cook-mode-route";

export const metadata: Metadata = {
  title: "Cook recipe · Foodedo",
  robots: { index: false, follow: false },
};

export default function CookPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-paper" aria-label="Loading cook mode" />
      }
    >
      <CookModeRoute />
    </Suspense>
  );
}
