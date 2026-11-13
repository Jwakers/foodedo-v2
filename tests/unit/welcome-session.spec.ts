import { expect, test } from "@playwright/test";

import {
  persistWelcomeSkip,
  readPersistedWelcomeSkip,
  welcomeSkipStorageKey,
} from "../../src/lib/platform/welcome-session";

function withWindow(value: unknown, run: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("persists welcome skip on this device", () => {
  const store = new Map<string, string>();
  withWindow(
    {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    },
    () => {
      expect(readPersistedWelcomeSkip()).toBe(false);
      persistWelcomeSkip();
      expect(store.get(welcomeSkipStorageKey)).toBe("1");
      expect(readPersistedWelcomeSkip()).toBe(true);
    },
  );
});

test("honours an existing web-session dismissal during the upgrade", () => {
  withWindow(
    {
      localStorage: { getItem: () => null },
      sessionStorage: {
        getItem: (key: string) =>
          key === "foodedo.welcome.skipped" ? "1" : null,
      },
    },
    () => {
      expect(readPersistedWelcomeSkip()).toBe(true);
    },
  );
});

test("blocked storage does not throw when reading or remembering entry", () => {
  withWindow(
    {
      get localStorage() {
        throw new Error("Storage blocked");
      },
      get sessionStorage() {
        throw new Error("Storage blocked");
      },
    },
    () => {
      expect(readPersistedWelcomeSkip()).toBe(false);
      expect(() => persistWelcomeSkip()).not.toThrow();
    },
  );
});
