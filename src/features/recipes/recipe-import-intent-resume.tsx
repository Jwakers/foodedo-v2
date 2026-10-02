"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { readRecipeImportIntent } from "@/lib/domain/auth-intents";
import { createRecipeImportIntentStore } from "@/lib/platform/auth-intent-store";

/**
 * Lightweight global continuation. Kept separate from the importer page so
 * app-shell does not pull page-only previews, drawers and imagery into every
 * client route.
 */
export function RecipeImportIntentResume() {
  const router = useRouter();
  const { status, isAuthenticated } = useFoodedoAuth();
  const beginImport = useMutation(api.recipeImports.beginImport);
  const resumingRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || status === "loading" || resumingRef.current) return;
    resumingRef.current = true;
    void (async () => {
      const store = createRecipeImportIntentStore();
      try {
        const intent = readRecipeImportIntent(await store.read());
        if (!intent) return;
        const importId = await beginImport({
          clientRequestId: intent.clientRequestId,
          source: intent.source,
        });
        await store.clear();
        router.push(`/recipes/import?job=${importId}`);
      } catch (error) {
        console.error("Failed to resume recipe import.", error);
        toast.error("Foodedo couldn’t resume that recipe import.");
      } finally {
        resumingRef.current = false;
      }
    })();
  }, [beginImport, isAuthenticated, router, status]);
  return null;
}
