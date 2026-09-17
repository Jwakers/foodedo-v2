import type { CookRecipeContext, CookSession } from "../domain/cook-session";
import { restoreCookSession } from "../domain/cook-session";
import {
  localObjectStores,
  openFoodedoDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

const storeName = localObjectStores.cookSessions;
const pendingOperations = new Map<string, Promise<void>>();

export async function readCookSession(context: CookRecipeContext) {
  await pendingOperations.get(context.meal.slug)?.catch(() => undefined);
  const database = await openFoodedoDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(context.meal.slug);
    const result: unknown = await requestResult(request);
    await transactionComplete(transaction);
    return restoreCookSession(result, context);
  } finally {
    database.close();
  }
}

export function writeCookSession(session: CookSession) {
  return enqueue(session.recipeSlug, async () => {
    const database = await openFoodedoDatabase();
    try {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(session, session.recipeSlug);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  });
}

export function clearCookSession(recipeSlug: string) {
  return enqueue(recipeSlug, async () => {
    const database = await openFoodedoDatabase();
    try {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(recipeSlug);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  });
}

function enqueue(recipeSlug: string, operation: () => Promise<void>) {
  const previous = pendingOperations.get(recipeSlug) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingOperations.set(recipeSlug, next);
  const release = () => {
    if (pendingOperations.get(recipeSlug) === next) {
      pendingOperations.delete(recipeSlug);
    }
  };
  void next.then(release, release);
  return next;
}
