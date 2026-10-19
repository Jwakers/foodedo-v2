import { personalRecipeDetailPath } from "../routing/recipes";

export type ImportNotificationJob = {
  _id: string;
  attempt: number;
  updatedAt: number;
  status:
    | "queued"
    | "processing"
    | "succeeded"
    | "needs_review"
    | "awaiting_input"
    | "failed";
  resultRecipeId?: string;
};
export type ImportNotificationLedger = {
  version: 1;
  startedAt: number;
  acknowledged: string[];
};
const retentionMs = 7 * 24 * 60 * 60 * 1000;

export function readImportNotificationLedger(
  value: unknown,
  now: number,
): ImportNotificationLedger {
  const fallback: ImportNotificationLedger = {
    version: 1,
    startedAt: now,
    acknowledged: [],
  };
  if (!value || typeof value !== "object") return fallback;
  const record = value as Partial<ImportNotificationLedger>;
  if (
    record.version !== 1 ||
    typeof record.startedAt !== "number" ||
    !Number.isFinite(record.startedAt) ||
    record.startedAt > now ||
    record.startedAt < now - retentionMs ||
    !Array.isArray(record.acknowledged)
  )
    return fallback;
  return {
    version: 1,
    startedAt: record.startedAt,
    acknowledged: [
      ...new Set(
        record.acknowledged.filter(
          (key): key is string => typeof key === "string" && key.length <= 140,
        ),
      ),
    ].slice(-80),
  };
}

export function importNotification(job: ImportNotificationJob) {
  const reviewPath = `/recipes/import?job=${encodeURIComponent(job._id)}`;
  if (
    (job.status === "succeeded" || job.status === "needs_review") &&
    job.resultRecipeId
  )
    return {
      key: `${job._id}:${job.attempt}:ready`,
      title: "Your recipe is ready",
      label: "Open recipe",
      path: personalRecipeDetailPath(job.resultRecipeId),
    };
  if (job.status === "awaiting_input")
    return {
      key: `${job._id}:${job.attempt}:draft`,
      title: "Your recipe needs a little more detail",
      label: "Review import",
      path: reviewPath,
    };
  if (job.status === "failed")
    return {
      key: `${job._id}:${job.attempt}:failed`,
      title: "We couldn’t finish your recipe import",
      label: "Review import",
      path: reviewPath,
    };
  return null;
}

export function shouldNotifyImport(
  job: ImportNotificationJob,
  ledger: ImportNotificationLedger,
) {
  const notification = importNotification(job);
  return Boolean(
    notification &&
    job.updatedAt >= ledger.startedAt &&
    !ledger.acknowledged.includes(notification.key),
  );
}

export function acknowledgeImportNotification(
  ledger: ImportNotificationLedger,
  key: string,
): ImportNotificationLedger {
  return {
    ...ledger,
    acknowledged: [
      ...ledger.acknowledged.filter((item) => item !== key),
      key,
    ].slice(-80),
  };
}
