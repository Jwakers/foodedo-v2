import { useDashboardState } from "../../../src/features/dashboard/use-dashboard-state";

// Only the final content is substituted; entry, auth, account, household, plan
// readiness and chrome selection all use the production components/hooks.
export function Dashboard() {
  const { currentPlan } = useDashboardState();
  return <h1>{currentPlan ? "What sounds good?" : "Dinner, decided."}</h1>;
}
