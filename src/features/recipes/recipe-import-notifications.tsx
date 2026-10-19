"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
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
    <OwnerImportNotifications key={userId} userId={userId} />
  ) : null;
}

function OwnerImportNotifications({ userId }: { userId: string }) {
  const router = useRouter();
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
      if (
        !notification ||
        !shouldNotifyImport(job, ledger.current) ||
        shown.current.get(toastId) === notification.key
      )
        continue;
      shown.current.set(toastId, notification.key);
      const acknowledge = () => {
        ledger.current = acknowledgeImportNotification(
          ledger.current!,
          notification.key,
        );
        saveImportNotifications(userId, ledger.current);
      };
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
  }, [jobs, router, userId]);

  useEffect(() => {
    const notifications = shown.current;
    return () => {
      for (const id of notifications.keys()) toast.dismiss(id);
      notifications.clear();
    };
  }, []);
  return null;
}
