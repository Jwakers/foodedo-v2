import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { RecipeImportIntentResume } from "../../../src/features/recipes/recipe-import-intent-resume";
import { createRecipeImportIntent } from "../../../src/lib/domain/auth-intents";
import { createRecipeImportIntentStore } from "../../../src/lib/platform/auth-intent-store";
import { calls, navigation } from "./state";

declare global {
  interface Window {
    importPermissionFixture: {
      calls: unknown[];
      navigation: string[];
      read: () => Promise<unknown>;
    };
  }
}

async function mount() {
  const store = createRecipeImportIntentStore();
  await store.write(
    createRecipeImportIntent({
      clientRequestId: "permission-fixture",
      source: { type: "url", url: "https://example.com/recipe" },
      now: Date.now(),
    }),
  );
  window.importPermissionFixture = {
    calls,
    navigation,
    read: () => store.read(),
  };
  createRoot(document.getElementById("root")!).render(
    <>
      <h1>Import permission fixture</h1>
      <Toaster />
      <RecipeImportIntentResume />
    </>,
  );
}
void mount();
