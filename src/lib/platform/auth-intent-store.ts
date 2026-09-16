import type {
  AdjustPlanIntentV1,
  CatalogueSaveIntentV1,
} from "@/lib/domain/auth-intents";
import {
  localObjectStores,
  observeTransactionComplete,
  openFoodedoDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

const catalogueSaveKey = "catalogue-recipe-save";
const adjustPlanKey = "open-adjust-plan";
const objectStoreName = localObjectStores.authIntents;

/** One keyed slot in the shared `auth-intents` IndexedDB store. */
export interface AuthIntentStore<T> {
  read(): Promise<unknown | null>;
  write(intent: T): Promise<void>;
  clear(): Promise<void>;
}

function createAuthIntentStore<T>(key: string): AuthIntentStore<T> {
  return {
    async read() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readonly");
        const completed = transactionComplete(transaction);
        const request = transaction.objectStore(objectStoreName).get(key);
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

    async write(intent) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        const completed = transactionComplete(transaction);
        transaction.objectStore(objectStoreName).put(intent, key);
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
        transaction.objectStore(objectStoreName).delete(key);
        await completed;
      } finally {
        database.close();
      }
    },
  };
}

export function createCatalogueSaveIntentStore(): AuthIntentStore<CatalogueSaveIntentV1> {
  return createAuthIntentStore(catalogueSaveKey);
}

export function createAdjustPlanIntentStore(): AuthIntentStore<AdjustPlanIntentV1> {
  return createAuthIntentStore(adjustPlanKey);
}
