import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountSyncGate } from "../../../src/features/auth/account-sync-gate";
import { api } from "../../../convex/_generated/api";
import { createIndexedDbGuestDraftStore } from "../../../src/lib/platform/guest-draft-store";
import { useAuth } from "./clerk";
import { useConvexAuth, useQuery } from "./convex";
import { completeRecovery, counts, update } from "./state";

declare global {
  interface Window {
    accountSyncFixture: {
      update: typeof update;
      counts: typeof counts;
      completeRecovery: typeof completeRecovery;
      seedDraft: () => Promise<unknown>;
      readDraft: () => Promise<unknown>;
    };
  }
}
const store = createIndexedDbGuestDraftStore("current");
window.accountSyncFixture = {
  update,
  counts,
  completeRecovery,
  async seedDraft() {
    await store.write({
      schemaVersion: 3,
      planStartDate: "2030-01-01",
      planDays: 3,
      servings: 2,
      mealChoices: ["2030-01-01", "2030-01-02", "2030-01-03"].map((date) => ({
        date,
        catalogueMealId: "dinner",
        catalogueVersion: 1,
      })),
      createdAt: 1,
      updatedAt: 1,
    });
    return store.read();
  },
  readDraft: () => store.read(),
};
function ProtectedApp() {
  const auth = useAuth();
  const convex = useConvexAuth();
  useQuery(
    api.households.current,
    auth.isSignedIn && convex.isAuthenticated && !convex.isLoading
      ? {}
      : "skip",
  );
  return (
    <h1>{auth.isSignedIn ? "Signed-in app ready" : "Guest planner ready"}</h1>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccountSyncGate>
      <ProtectedApp />
    </AccountSyncGate>
  </StrictMode>,
);
