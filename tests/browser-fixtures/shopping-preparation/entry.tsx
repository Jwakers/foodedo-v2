import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Id } from "../../../convex/_generated/dataModel";
import { useShoppingListPreparation } from "../../../src/features/shop/use-shopping-list-preparation";
import { fixture, useSpace } from "./state";
declare global {
  interface Window {
    preparationFixture: typeof fixture;
  }
}
window.preparationFixture = fixture;
function App() {
  const space = useSpace();
  const { isSyncing, syncError, retrySync } = useShoppingListPreparation({
    status: "ready",
    currentMealPlanId: space as Id<"mealPlans">,
    startDate: "2030-01-01",
    endDate: "2030-01-03",
    mealCount: 1,
    list: null,
  });
  return (
    <>
      <p role="status">{isSyncing ? "Preparing" : (syncError ?? "Ready")}</p>
      <button onClick={retrySync}>Retry</button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
