"use client";

import { recipeImportErrorMessage } from "./recipe-import-errors";
import { Capacitor } from "@capacitor/core";
import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";
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
  const approvedCaptures = useRef(new Set<string>());
  // Job updates must not cancel the claim → enqueue → acknowledge handoff.
  const currentContext = useEffectEvent(() => ({
    jobs,
    beginImport,
    openSignIn,
    router,
  }));
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let removeListener: (() => Promise<void>) | undefined;
    let running = false;
    let limitBlocked = false;
    async function drain() {
      if (
        !active ||
        running ||
        limitBlocked ||
        document.visibilityState === "hidden" ||
        status === "loading" ||
        status === "connection_error"
      )
        return;
      running = true;
      let shouldPoll = true;
      try {
        const { jobs, beginImport, openSignIn, router } = currentContext();
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
          // Older Swift captures store fractional milliseconds; intents use integers.
          now: Math.floor(capture.createdAt),
        });
        if (status === "guest") {
          if (shownNotices.current.has(`guest:${capture.id}`)) return;
          shownNotices.current.add(`guest:${capture.id}`);
          toast("Recipe link saved", {
            id: `native-share:${capture.id}`,
            description:
              "Sign in to add it to your account and access it on your other devices.",
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
          toast("This recipe link belongs to another account", {
            id: `native-share:${capture.id}`,
            description:
              "Sign in to the account you used to start adding this recipe. Your link will wait here for up to seven days.",
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
        const approvalKey = `${userId}:${capture.id}`;
        if (shownNotices.current.has(pausedNotice)) return;
        if (
          !approvedCaptures.current.has(approvalKey) &&
          !confirmRecipeImportSharing()
        ) {
          shownNotices.current.add(pausedNotice);
          toast("Recipe import paused", {
            id: `native-share:${capture.id}`,
            description:
              "Your recipe hasn’t been added to your account yet. Your link is waiting for when you’re ready.",
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
        approvedCaptures.current.add(approvalKey);
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
        // Once the server accepted this capture, finish acknowledgement even if
        // auth or navigation rerendered the coordinator while the call awaited.
        await recipeCapture.acknowledge({ id: capture.id, owner: userId });
        approvedCaptures.current.delete(approvalKey);
        toast.dismiss("native-capture-limit");
        toast.dismiss(`native-share:${capture.id}`);
        if (active) {
          router.push(`/recipes/import?job=${importId}`);
          toast("Adding your recipe…", {
            id: `native-share:${capture.id}`,
            action: {
              label: "See progress",
              onClick: () => router.push(`/recipes/import?job=${importId}`),
            },
          });
        }
      } catch (error) {
        const limitMessage = recipeImportErrorMessage(error, "");
        if (limitMessage) {
          limitBlocked = true;
          shouldPoll = false;
          if (active)
            toast.error(limitMessage, {
              id: "native-capture-limit",
              duration: Infinity,
              description: "Your link is waiting to be added to your account.",
              action: {
                label: "Try again",
                onClick: () => {
                  limitBlocked = false;
                  void drain();
                },
              },
            });
          return;
        }
        if (active && !shownNotices.current.has("error")) {
          shownNotices.current.add("error");
          toast.error(
            "We couldn’t add your recipe to your account. Your link is still waiting. Please try again.",
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
              limitBlocked = false;
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
      toast.dismiss("native-capture-limit");
      if (timer) clearTimeout(timer);
      void removeListener?.();
    };
  }, [status, userId]);
  return null;
}
