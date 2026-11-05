"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { parsePersonalRecipeId } from "@/lib/routing/recipes";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import {
  acknowledgeImportNotification,
  importNotification,
  shouldNotifyImport,
  type ImportNotificationLedger,
} from "@/lib/domain/recipe-import-notifications";
import {
  loadImportNotifications,
  saveImportNotifications,
} from "@/lib/platform/recipe-import-notifications";

export function RecipeImportNotifications() {
  const { isAuthenticated, userId } = useFoodedoAuth();
  return isAuthenticated && userId ? (
    <Suspense fallback={null}>
      <OwnerImportNotifications key={userId} userId={userId} />
    </Suspense>
  ) : null;
}

function OwnerImportNotifications({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewedRecipeId =
    pathname === "/recipes/view" || pathname === "/recipes/cook"
      ? parsePersonalRecipeId(searchParams)
      : null;
  const jobs = useQuery(api.recipeImports.notificationJobs, {});
  const ledger = useRef<ImportNotificationLedger | null>(null);
  const shown = useRef(new Map<string, string>());

  useEffect(() => {
    ledger.current ??= loadImportNotifications(userId, Date.now());
    saveImportNotifications(userId, ledger.current);
    if (!jobs) return;
    for (const job of jobs) {
      const toastId = `recipe-import:${userId}:${job._id}`;
      if (job.status === "queued" || job.status === "processing") {
        if (shown.current.delete(toastId)) toast.dismiss(toastId);
        continue;
      }
      const notification = importNotification(job);
      if (!notification) continue;
      const acknowledge = () => {
        ledger.current = acknowledgeImportNotification(
          ledger.current!,
          notification.key,
        );
        saveImportNotifications(userId, ledger.current);
      };
      // Arriving independently also consumes the ready notification. Persist
      // that acknowledgement so it stays dismissed after leaving or reloading.
      if (
        (job.status === "succeeded" || job.status === "needs_review") &&
        job.resultRecipeId === viewedRecipeId
      ) {
        if (!ledger.current.acknowledged.includes(notification.key))
          acknowledge();
        shown.current.delete(toastId);
        toast.dismiss(toastId);
        continue;
      }
      if (
        !shouldNotifyImport(job, ledger.current) ||
        shown.current.get(toastId) === notification.key
      )
        continue;
      shown.current.set(toastId, notification.key);
      toast(notification.title, {
        id: toastId,
        duration: Infinity,
        dismissible: true,
        classNames: { actionButton: "min-h-11", cancelButton: "min-h-11" },
        action: {
          label: notification.label,
          onClick: () => {
            acknowledge();
            router.push(notification.path);
          },
        },
        cancel: { label: "Dismiss", onClick: acknowledge },
        onDismiss: acknowledge,
      });
    }
  }, [jobs, router, userId, viewedRecipeId]);

  useEffect(() => {
    const notifications = shown.current;
    return () => {
      for (const id of notifications.keys()) toast.dismiss(id);
      notifications.clear();
    };
  }, []);
  return null;
}
