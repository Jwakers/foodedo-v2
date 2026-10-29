import { OnboardingProvider } from "../../../src/features/onboarding/use-onboarding";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { AppToaster } from "../../../src/components/app-toaster";
import { RecipeSaveConfirmationProvider } from "../../../src/features/recipes/recipe-save-confirmation";
import {
  HouseholdProvider,
  useHouseholdSpace,
} from "../../../src/features/household/household-context";
import { MealsYouMightLike } from "../../../src/features/dashboard/meals-you-might-like";
import { ActivePlanDashboard } from "../../../src/features/dashboard/active-plan-dashboard";
import { CatalogueSaveIntentResume } from "../../../src/features/recipes/catalogue-recipe-library";
import { fixturePlan, meals } from "./convex";
import { RecipeDetailHeaderActions } from "../../../src/features/recipes/recipe-detail-header-actions";
import { RecipesListing } from "../../../src/features/recipes/recipes-listing";

function App() {
  const { select, isHousehold } = useHouseholdSpace();
  const [home, setHome] = useState(true);
  const [signIn, setSignIn] = useState(false);
  const [surfaces] = useState(() =>
    new URLSearchParams(location.search).has("surfaces"),
  );
  const [web] = useState(() => new URLSearchParams(location.search).has("web"));
  useEffect(() => {
    const open = () => setSignIn(true);
    window.addEventListener("fixture:sign-in", open);
    return () => window.removeEventListener("fixture:sign-in", open);
  }, []);
  const full = new URLSearchParams(location.search).has("full");
  return (
    <>
      <CatalogueSaveIntentResume />
      <nav>
        <button onClick={() => setHome(!home)}>
          {home ? "Leave Home" : "Return Home"}
        </button>
        <button onClick={() => select("private")}>Private space</button>
        <button onClick={() => select("household")}>Household space</button>
      </nav>
      {signIn ? (
        <div role="dialog" aria-label="Sign in">
          <button
            onClick={() => {
              sessionStorage.setItem("fixture:identity", "fixture-alice");
              dispatchEvent(new Event("fixture:auth-change"));
              setSignIn(false);
            }}
          >
            Complete sign-in
          </button>
          <button onClick={() => setSignIn(false)}>Cancel sign-in</button>
        </div>
      ) : null}
      <main className="px-page-inline py-8">
        {surfaces ? (
          <>
            <section aria-label="Recipe header">
              <RecipeDetailHeaderActions
                recipe={{ ...meals[1], ingredients: [], steps: [] }}
              />
            </section>
            <RecipesListing
              webPagination={
                web
                  ? { pageNumber: 1, totalPages: 1, location: "/recipes" }
                  : undefined
              }
            />
          </>
        ) : null}
        {home ? (
          full ? (
            <ActivePlanDashboard
              plan={
                fixturePlan(isHousehold) as Parameters<
                  typeof ActivePlanDashboard
                >[0]["plan"]
              }
            />
          ) : (
            <MealsYouMightLike />
          )
        ) : (
          <p>Away from Home</p>
        )}
      </main>
      <AppToaster dockVisible />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <HouseholdProvider>
    <OnboardingProvider>
      <RecipeSaveConfirmationProvider>
        <App />
      </RecipeSaveConfirmationProvider>
    </OnboardingProvider>
  </HouseholdProvider>,
);
