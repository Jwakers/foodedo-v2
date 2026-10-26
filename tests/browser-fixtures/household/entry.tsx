import { OnboardingProvider } from "../../../src/features/onboarding/use-onboarding";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Toaster } from "sonner";
import {
  HouseholdProvider,
  useHouseholdSpace,
} from "../../../src/features/household/household-context";
import {
  ActiveWeek,
  type ActiveWeekPlan,
} from "../../../src/features/plan/active-week";
import { ShoppingListPage } from "../../../src/features/shop/shopping-list-page";
import { Dashboard } from "../../../src/features/dashboard/dashboard";
import { InviteLinkPage } from "../../../src/features/household/invite-link-page";
import { SavedWeekPage } from "../../../src/features/plan/saved-week-page";
import { HouseholdPage } from "../../../src/features/household/household-page";
import { JoinHouseholdPage } from "../../../src/features/household/join-household-page";
import { PlanThisMeal } from "../../../src/features/plan/plan-this-meal";
import { ReplanReview } from "../../../src/features/plan/replan-review";
import { PlanSetupRoute } from "../../../src/features/plan/plan-setup-page";
import { WeekPage } from "../../../src/features/plan/week-page";
import { InviteContinuation } from "../../../src/features/household/invite-continuation";
import { BrandLogo } from "../../../src/components/brand-logo";
import { usePathname } from "./navigation";
import { useQuery } from "./convex";
import { api } from "../../../convex/_generated/api";
if (location.pathname === "/household/join")
  sessionStorage.setItem("fixture:join-journey", "true");
function Screen() {
  const { spaceArgs, spaceKey } = useHouseholdSpace();
  const pathname = usePathname();
  // Follow real routes for invitation journeys while retaining the existing
  // tab controls for week/shopping interaction fixtures.
  const [joinJourney] = useState(() => {
    return sessionStorage.getItem("fixture:join-journey") === "true";
  });
  const [screen, setScreen] = useState(
    () => new URLSearchParams(location.search).get("screen") ?? "week",
  );
  const guest = new URLSearchParams(location.search).get("role") === "guest";
  const plan = useQuery(
    api.mealPlans.getCurrent,
    guest ? "skip" : spaceArgs,
  ) as ActiveWeekPlan;
  const currentScreen =
    pathname === "/week/setup"
      ? "setup"
      : pathname === "/week/replan"
        ? "replan"
        : joinJourney
          ? pathname === "/household/join"
            ? "join"
            : pathname === "/"
              ? "dashboard"
              : "week"
          : screen;
  return (
    <>
      <InviteContinuation />
      <BrandLogo href="/" />
      <nav>
        <button onClick={() => setScreen("week")}>Week tab</button>
        <button onClick={() => setScreen("shop")}>Shop tab</button>
        <button onClick={() => setScreen("household")}>Household tab</button>
      </nav>
      <div key={spaceKey}>
        {currentScreen === "setup" ? (
          <PlanSetupRoute />
        ) : currentScreen === "join" ? (
          <JoinHouseholdPage />
        ) : currentScreen === "replan" ? (
          <ReplanReview />
        ) : currentScreen === "planner" ? (
          <PlanThisMeal
            meal={{
              id: "private-meal",
              version: 1,
              title: "Private work-trip dinner",
            }}
          />
        ) : currentScreen === "dashboard" ? (
          <main className="px-page-inline py-8">
            <Dashboard />
          </main>
        ) : currentScreen === "invite" ? (
          <InviteLinkPage />
        ) : currentScreen === "week-page" ? (
          <WeekPage />
        ) : currentScreen === "week" ? (
          <ActiveWeek
            plan={plan}
            plans={[plan]}
            onSelectPlan={() => {}}
            onReplan={() => {}}
            isReplanning={false}
            onStartNextPlan={() => {}}
            isStartingNextPlan={false}
          />
        ) : currentScreen === "saved" ? (
          <SavedWeekPage />
        ) : currentScreen === "shop" ? (
          <ShoppingListPage />
        ) : (
          <HouseholdPage />
        )}
      </div>
      <Toaster />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <OnboardingProvider>
    <HouseholdProvider>
      <Screen />
    </HouseholdProvider>
  </OnboardingProvider>,
);
