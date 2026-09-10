import type { GuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  localObjectStores,
  openFoodedoDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

export type GuestDraftMutationResult = {
  draft: GuestDraftV1;
  /** When false, storage is left unchanged after the exclusive read. */
  write: boolean;
};

export interface GuestDraftStore {
  read(): Promise<unknown | null>;
  write(draft: GuestDraftV1): Promise<void>;
  clear(): Promise<void>;
  /**
   * Exclusive read-modify-write. IndexedDB uses one readwrite transaction so
   * mutations serialize across tabs/windows as well as within a page.
   * `mutate` must stay synchronous so the transaction stays active.
   */
  runMutation(
    mutate: (current: unknown | null) => GuestDraftMutationResult,
  ): Promise<GuestDraftV1>;
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

    async runMutation(mutate) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const objectStore = transaction.objectStore(objectStoreName);
        const current =
          (await requestResult(objectStore.get(currentDraftKey))) ?? null;

        let result: GuestDraftMutationResult;
        try {
          result = mutate(current);
        } catch (error) {
          // Finish the exclusive txn with no write so storage stays unchanged.
          await transactionComplete(transaction);
          throw error;
        }

        if (result.write) {
          objectStore.put(result.draft, currentDraftKey);
        }

        await transactionComplete(transaction);
        return result.draft;
      } finally {
        database.close();
      }
    },
  };
}
