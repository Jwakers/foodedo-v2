const databaseName = "foodedo";
const databaseVersion = 3;

export const localObjectStores = {
  guestDrafts: "guest-drafts",
  authIntents: "auth-intents",
  cookSessions: "cook-sessions",
} as const;

export function openFoodedoDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      for (const storeName of Object.values(localObjectStores)) {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed."));
    request.onblocked = () =>
      reject(new Error("IndexedDB is blocked by another Foodedo window."));
  });
}

export function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed."));
  });
}

export function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

/**
 * Observe an IndexedDB transaction's completion promise without changing
 * control flow. Prevents unhandled rejections after a prior request failure.
 */
export async function observeTransactionComplete(
  completed: Promise<void>,
): Promise<void> {
  await completed.catch(() => undefined);
}
