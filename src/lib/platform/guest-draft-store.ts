import type { GuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  localObjectStores,
  observeTransactionComplete,
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
   * Atomically delete the current draft only when it is still the expected
   * revision. Prevents a completed claim in one tab deleting newer work.
   */
  clearIf(predicate: (current: unknown | null) => boolean): Promise<boolean>;
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
        const completed = transactionComplete(transaction);
        const request = transaction
          .objectStore(objectStoreName)
          .get(currentDraftKey);
        try {
          const result = await requestResult(request);
          await completed;
          return result ?? null;
        } catch (error) {
          await observeTransactionComplete(completed);
          throw error;
        }
      } finally {
        database.close();
      }
    },

    async write(draft) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const completed = transactionComplete(transaction);
        transaction.objectStore(objectStoreName).put(draft, currentDraftKey);
        await completed;
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const completed = transactionComplete(transaction);
        transaction.objectStore(objectStoreName).delete(currentDraftKey);
        await completed;
      } finally {
        database.close();
      }
    },

    async clearIf(predicate) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const completed = transactionComplete(transaction);
        const objectStore = transaction.objectStore(objectStoreName);
        try {
          const current =
            (await requestResult(objectStore.get(currentDraftKey))) ?? null;
          const shouldClear = predicate(current);
          if (shouldClear) {
            objectStore.delete(currentDraftKey);
          }
          await completed;
          return shouldClear;
        } catch (error) {
          await observeTransactionComplete(completed);
          throw error;
        }
      } finally {
        database.close();
      }
    },

    async runMutation(mutate) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const completed = transactionComplete(transaction);
        const objectStore = transaction.objectStore(objectStoreName);

        let current: unknown | null;
        try {
          current =
            (await requestResult(objectStore.get(currentDraftKey))) ?? null;
        } catch (error) {
          await observeTransactionComplete(completed);
          throw error;
        }

        let result: GuestDraftMutationResult;
        try {
          result = mutate(current);
        } catch (error) {
          // Finish the exclusive txn with no write so storage stays unchanged.
          await completed;
          throw error;
        }

        if (result.write) {
          objectStore.put(result.draft, currentDraftKey);
        }

        await completed;
        return result.draft;
      } finally {
        database.close();
      }
    },
  };
}
