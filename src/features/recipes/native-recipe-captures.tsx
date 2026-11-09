"use client";
import { Capacitor } from "@capacitor/core";
import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import {
  createRecipeImportIntent,
  readRecipeImportIntent,
} from "@/lib/domain/auth-intents";
import { createRecipeImportIntentStore } from "@/lib/platform/auth-intent-store";
import { confirmRecipeImportSharing } from "@/lib/platform/recipe-import-permission";

export function NativeRecipeCaptures() {
  return Capacitor.isNativePlatform() ? <CaptureCoordinator /> : null;
}
function CaptureCoordinator() {
  const { status, userId } = useFoodedoAuth();
  const { openSignIn } = useClerk();
  const router = useRouter();
  const jobs = useQuery(
    api.recipeImports.notificationJobs,
    status === "authenticated" ? {} : "skip",
  );
  const beginImport = useMutation(api.recipeImports.beginImport);
  const shownNotices = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeListener: (() => Promise<void>) | undefined;
    let running = false;
    async function drain() {
      if (
        !active ||
        running ||
        document.visibilityState === "hidden" ||
        status === "loading" ||
        status === "connection_error"
      )
        return;
      running = true;
      let shouldPoll = true;
      try {
        const { recipeCapture } =
          await import("@/lib/platform/capacitor/recipe-capture");
        const { capture } = await recipeCapture.peek();
        if (!active || !capture) {
          shouldPoll = false;
          return;
        }
        // Reuse the input limits before crossing the account boundary.
        const intent = createRecipeImportIntent({
          clientRequestId: `native-share:${capture.id}`,
          source: {
            type: "url",
            url: capture.url,
            ...(capture.sharedText ? { sharedText: capture.sharedText } : {}),
          },
          now: capture.createdAt,
        });
        if (status === "guest") {
          if (shownNotices.current.has(`guest:${capture.id}`)) return;
          shownNotices.current.add(`guest:${capture.id}`);
          toast("Recipe captured", {
            id: `native-share:${capture.id}`,
            description: "Sign in to import it into your recipes.",
            duration: Infinity,
            action: {
              label: "Sign in to import",
              onClick: () =>
                openSignIn({ forceRedirectUrl: "/recipes/import" }),
            },
          });
          return;
        }
        if (status !== "authenticated" || !userId || jobs === undefined) return;
        if (capture.claimedBy && capture.claimedBy !== userId) {
          if (shownNotices.current.has(`account:${capture.id}`)) return;
          shownNotices.current.add(`account:${capture.id}`);
          toast("A captured recipe is waiting for another account", {
            id: `native-share:${capture.id}`,
            description:
              "Sign in to the account that started this import. The capture stays on this device for up to seven days.",
            duration: Infinity,
          });
          return;
        }
        // Existing browser/sign-in continuation and active jobs take precedence.
        if (
          jobs.some(
            (job) => job.status === "queued" || job.status === "processing",
          )
        )
          return;
        if (
          readRecipeImportIntent(await createRecipeImportIntentStore().read())
        )
          return;
        if (!active) return;
        const pausedNotice = `paused:${capture.id}`;
        if (shownNotices.current.has(pausedNotice)) return;
        if (!confirmRecipeImportSharing()) {
          shownNotices.current.add(pausedNotice);
          toast("Recipe import paused", {
            id: `native-share:${capture.id}`,
            description:
              "Your capture remains on this device. No import was started.",
            duration: Infinity,
            action: {
              label: "Try again",
              onClick: () => {
                shownNotices.current.delete(pausedNotice);
                if (timer) clearTimeout(timer);
                void drain();
              },
            },
          });
          return;
        }
        await recipeCapture.claim({ id: capture.id, owner: userId });
        if (!active) return;
        const importId = await beginImport({
          clientRequestId: intent.clientRequestId,
          expectedAuthSubject: userId,
          source: {
            type: "url",
            url: capture.url,
            sharedText: capture.sharedText,
          },
        });
        if (!active) return;
        await recipeCapture.acknowledge({ id: capture.id, owner: userId });
        toast.dismiss(`native-share:${capture.id}`);
        if (active)
          toast("Importing captured recipe", {
            id: `native-share:${capture.id}`,
            action: {
              label: "View import",
              onClick: () => router.push(`/recipes/import?job=${importId}`),
            },
          });
      } catch {
        if (active && !shownNotices.current.has("error")) {
          shownNotices.current.add("error");
          toast.error(
            "Foodedo couldn’t resume the captured recipe. It remains in the inbox.",
            { id: "native-capture-error" },
          );
        }
      } finally {
        running = false;
        if (active && shouldPoll) timer = setTimeout(() => void drain(), 2_000);
      }
    }
    void drain();
    void import("@capacitor/app")
      .then(async ({ App }) => {
        const listener = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (isActive) {
              if (timer) clearTimeout(timer);
              void drain();
            }
          },
        );
        if (!active) await listener.remove();
        else removeListener = () => listener.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      void removeListener?.();
    };
  }, [status, userId, jobs, beginImport, openSignIn, router]);
  return null;
}
