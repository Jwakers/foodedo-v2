import { expect, test } from "@playwright/test";
import {
  acknowledgeImportNotification,
  importNotification,
  readImportNotificationLedger,
  shouldNotifyImport,
  type ImportNotificationJob,
} from "@/lib/domain/recipe-import-notifications";
import {
  loadImportNotifications,
  saveImportNotifications,
} from "@/lib/platform/recipe-import-notifications";

const now = 100_000;
const ready: ImportNotificationJob = {
  _id: "job-1",
  attempt: 1,
  updatedAt: now + 1000,
  status: "succeeded",
  resultRecipeId: "recipe-1",
};

test("background completion routes to the native-compatible recipe screen", () => {
  const ledger = readImportNotificationLedger(null, now);
  expect(shouldNotifyImport({ ...ready, status: "processing" }, ledger)).toBe(
    false,
  );
  expect(shouldNotifyImport(ready, ledger)).toBe(true);
  expect(importNotification(ready)).toMatchObject({
    title: "Your recipe is ready",
    label: "Open recipe",
    path: "/recipes/view?recipeId=recipe-1",
  });
  expect(importNotification({ ...ready, status: "needs_review" })).toEqual(
    importNotification(ready),
  );
});

test("drafts and failures link to their job without manufacturing a recipe", () => {
  for (const status of ["awaiting_input", "failed"] as const)
    expect(
      importNotification({ ...ready, status, resultRecipeId: undefined }),
    ).toMatchObject({
      label: "Review import",
      path: "/recipes/import?job=job-1",
    });
  expect(
    importNotification({ ...ready, resultRecipeId: undefined }),
  ).toBeNull();
});

test("dismissed results stay dismissed across reload and metadata review", () => {
  const ledger = acknowledgeImportNotification(
    readImportNotificationLedger(null, now),
    importNotification(ready)!.key,
  );
  const reloaded = readImportNotificationLedger(
    JSON.parse(JSON.stringify(ledger)),
    now + 2000,
  );
  expect(shouldNotifyImport(ready, reloaded)).toBe(false);
  expect(
    shouldNotifyImport(
      { ...ready, status: "needs_review", updatedAt: now + 3000 },
      reloaded,
    ),
  ).toBe(false);
  expect(shouldNotifyImport({ ...ready, attempt: 2 }, reloaded)).toBe(true);
});

test("unread completion survives reload, old imports do not cause a toast storm", () => {
  const ledger = readImportNotificationLedger(null, now);
  const reloaded = readImportNotificationLedger(ledger, now + 2000);
  expect(shouldNotifyImport(ready, reloaded)).toBe(true);
  expect(
    shouldNotifyImport({ ...ready, updatedAt: now - 1000 }, reloaded),
  ).toBe(false);
  expect(
    importNotification({ ...ready, status: "awaiting_input" })!.key,
  ).not.toBe(importNotification(ready)!.key);
});

test("notification storage is bounded, versioned and tolerates invalid state", () => {
  for (const value of [
    null,
    {},
    { version: 2, startedAt: now, acknowledged: [] },
    { version: 1, startedAt: Infinity, acknowledged: [] },
    { version: 1, startedAt: now + 1000, acknowledged: [] },
  ])
    expect(readImportNotificationLedger(value, now)).toEqual({
      version: 1,
      startedAt: now,
      acknowledged: [],
    });
  const ledger = readImportNotificationLedger(
    {
      version: 1,
      startedAt: now,
      acknowledged: Array.from({ length: 100 }, (_, index) => `job-${index}`),
    },
    now,
  );
  expect(ledger.acknowledged).toHaveLength(80);
  expect(
    readImportNotificationLedger(ledger, now + 8 * 24 * 60 * 60 * 1000)
      .acknowledged,
  ).toEqual([]);
});

test("accounts have separate acknowledgements and unavailable storage degrades safely", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const ledger = acknowledgeImportNotification(
      readImportNotificationLedger(null, now),
      importNotification(ready)!.key,
    );
    saveImportNotifications("owner-a", ledger);
    expect(loadImportNotifications("owner-a", now).acknowledged).toHaveLength(
      1,
    );
    expect(loadImportNotifications("owner-b", now).acknowledged).toHaveLength(
      0,
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("Storage disabled");
      },
    });
    expect(loadImportNotifications("owner-a", now).acknowledged).toHaveLength(
      0,
    );
    expect(() => saveImportNotifications("owner-a", ledger)).not.toThrow();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
