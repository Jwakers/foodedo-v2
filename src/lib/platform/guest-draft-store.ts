import type { GuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  localObjectStores,
  openFoodedoDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

export interface GuestDraftStore {
  read(): Promise<unknown | null>;
  write(draft: GuestDraftV1): Promise<void>;
  clear(): Promise<void>;
}

const objectStoreName = localObjectStores.guestDrafts;
const currentDraftKey = "current";

export function createIndexedDbGuestDraftStore(): GuestDraftStore {
  return {
    async read() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readonly");
        const request = transaction
          .objectStore(objectStoreName)
          .get(currentDraftKey);
        const result = await requestResult(request);
        await transactionComplete(transaction);
        return result ?? null;
      } finally {
        database.close();
      }
    },

    async write(draft) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).put(draft, currentDraftKey);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).delete(currentDraftKey);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },
  };
}
