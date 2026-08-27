import type { CatalogueSaveIntentV1 } from "@/lib/domain/auth-intents";
import {
  localObjectStores,
  openFoodedoDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

const catalogueSaveKey = "catalogue-recipe-save";
const objectStoreName = localObjectStores.authIntents;

export interface CatalogueSaveIntentStore {
  read(): Promise<unknown | null>;
  write(intent: CatalogueSaveIntentV1): Promise<void>;
  clear(): Promise<void>;
}

export function createCatalogueSaveIntentStore(): CatalogueSaveIntentStore {
  return {
    async read() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readonly");
        const request = transaction
          .objectStore(objectStoreName)
          .get(catalogueSaveKey);
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
        transaction.objectStore(objectStoreName).put(intent, catalogueSaveKey);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },

    async clear() {
      const database = await openFoodedoDatabase();
      try {
        const transaction = database.transaction(objectStoreName, "readwrite");
        transaction.objectStore(objectStoreName).delete(catalogueSaveKey);
        await transactionComplete(transaction);
      } finally {
        database.close();
      }
    },
  };
}
