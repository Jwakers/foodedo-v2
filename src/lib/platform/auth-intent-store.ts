import type {
  AdjustPlanIntentV1,
  CatalogueSaveIntentV1,
} from "@/lib/domain/auth-intents";
import {
  localObjectStores,
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
        const request = transaction.objectStore(objectStoreName).get(key);
        const result = await requestResult(request);
        await transactionComplete(transaction);
        return result ?? null;
      } finally {
        database.close();
      }
    },

    async write(intent) {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).put(intent, key);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).delete(key);
        await transactionComplete(transaction);
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
