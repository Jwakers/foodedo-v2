import { expect, test } from "@playwright/test";

import {
  persistWelcomeSkip,
  readPersistedWelcomeSkip,
  shouldPersistWelcomeSkip,
  welcomeSkipStorageKey,
} from "../../src/lib/platform/welcome-session";

test("persists welcome skip for web builds", () => {
  expect(shouldPersistWelcomeSkip()).toBe(true);

  const store = new Map<string, string>();
  const previousWindow = globalThis.window;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
      },
    },
  });

  try {
    expect(readPersistedWelcomeSkip()).toBe(false);
    persistWelcomeSkip();
    expect(store.get(welcomeSkipStorageKey)).toBe("1");
    expect(readPersistedWelcomeSkip()).toBe(true);
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});
