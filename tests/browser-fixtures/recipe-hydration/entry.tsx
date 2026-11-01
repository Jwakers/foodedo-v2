import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AccountSyncGate } from "../../../src/features/auth/account-sync-gate";
import { OnboardingProvider } from "../../../src/features/onboarding/use-onboarding";
import { HouseholdProvider } from "../../../src/features/household/household-context";
import { AppShell } from "../../../src/components/app-shell";
import { PublicRecipeDetail } from "../../../src/features/recipes/public-recipe-detail";
import { RecipeDetailPage } from "../../../src/features/recipes/recipe-detail-page";
import { counts, meal, update, useFixture } from "./state";

declare global {
  interface Window {
    recipeHydrationFixture: { update: typeof update; counts: typeof counts };
  }
}
window.recipeHydrationFixture = { update, counts };
function Recipe() {
  const [identity] = useState(() => crypto.randomUUID());
  return (
    <main
      data-recipe-instance={identity}
      className="mx-auto w-full max-w-175 pb-10"
    >
      <PublicRecipeDetail
        initialRecipe={meal}
        canonicalUrl={`https://www.foodedo.com/recipes/${meal.slug}`}
      />
    </main>
  );
}
function Modal() {
  return useFixture().modalOpen ? (
    <div
      role="dialog"
      aria-label="Sign in"
      className="fixed inset-0 z-100 flex items-center justify-center bg-paper"
    >
      <button onClick={() => update({ modalOpen: false })}>Not now</button>
    </div>
  ) : null;
}
createRoot(document.getElementById("root")!).render(
  <>
    <AccountSyncGate>
      <OnboardingProvider>
        <HouseholdProvider>
          <AppShell>
            {location.pathname === "/recipes/view" ? (
              <RecipeDetailPage />
            ) : (
              <Recipe />
            )}
          </AppShell>
        </HouseholdProvider>
      </OnboardingProvider>
    </AccountSyncGate>
    <Modal />
  </>,
);
