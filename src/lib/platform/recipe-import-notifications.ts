import {
  readImportNotificationLedger,
  type ImportNotificationLedger,
} from "../domain/recipe-import-notifications";

const storageKey = (userId: string) =>
  `foodedo:import-notifications:v1:${userId}`;

export function loadImportNotifications(
  userId: string,
  now: number,
): ImportNotificationLedger {
  try {
    return readImportNotificationLedger(
      JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null"),
      now,
    );
  } catch {
    return readImportNotificationLedger(null, now);
  }
}

/** IDs/acknowledgements only; no recipe text or credentials. Storage is optional. */
export function saveImportNotifications(
  userId: string,
  ledger: ImportNotificationLedger,
) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ledger));
  } catch {
    /* In-memory notification tracking still works when storage is unavailable. */
  }
}
