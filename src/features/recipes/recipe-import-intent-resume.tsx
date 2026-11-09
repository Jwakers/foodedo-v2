"use client";

import { recipeImportErrorMessage } from "./recipe-import-errors";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { readRecipeImportIntent } from "@/lib/domain/auth-intents";
import { createRecipeImportIntentStore } from "@/lib/platform/auth-intent-store";
import { hasImportJobLink } from "./recipe-import-state";
import { confirmRecipeImportSharing } from "@/lib/platform/recipe-import-permission";

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
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || status === "loading" || resumingRef.current) return;
    // Observe an existing job instead of letting an older pending draft replace
    // its URL or creating another import during sign-in recovery.
    if (hasImportJobLink(window.location.pathname, window.location.search))
      return;
    resumingRef.current = true;
    void (async () => {
      const store = createRecipeImportIntentStore();
      try {
        const intent = readRecipeImportIntent(await store.read());
        if (!intent) return;
        if (!confirmRecipeImportSharing()) {
          toast("Recipe import paused", {
            description:
              "Your recipe remains on this device. No import was started.",
            action: {
              label: "Try again",
              onClick: () => setRetryVersion((value) => value + 1),
            },
          });
          return;
        }
        const importId = await beginImport({
          clientRequestId: intent.clientRequestId,
          source:
            intent.source.type === "url"
              ? intent.source
              : {
                  type: "text",
                  text: intent.source.text,
                  ...(intent.source.resume
                    ? {
                        resume: {
                          ...intent.source.resume,
                          importId: intent.source.resume
                            .importId as Id<"recipeImports">,
                        },
                      }
                    : {}),
                },
        });
        await store.clear();
        router.push(`/recipes/import?job=${importId}`);
      } catch (error) {
        console.error("Failed to resume recipe import.", error);
        toast.error(
          recipeImportErrorMessage(
            error,
            "Foodedo couldn’t resume that recipe import.",
          ),
        );
      } finally {
        resumingRef.current = false;
      }
    })();
  }, [beginImport, isAuthenticated, router, status, retryVersion]);
  return null;
}
