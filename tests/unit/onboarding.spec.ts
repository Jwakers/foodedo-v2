import { expect, test } from "@playwright/test";
import {
  mergeRetiredIntroductions,
  retiredIntroductionIds,
} from "../../src/lib/domain/onboarding";
import {
  createIntroductionStore,
  introductionStorageKey,
} from "../../src/features/onboarding/introduction-store";

test("legacy retirement flags and future IDs survive later dismissals", () => {
  const state = {
    homeRetired: true,
    shoppingRetired: true,
    retired: ["future-feature", "home"],
  };
  expect(retiredIntroductionIds(state)).toEqual([
    "future-feature",
    "home",
    "shopping",
  ]);
  expect(mergeRetiredIntroductions(state, ["recipes", "recipes"])).toEqual([
    "future-feature",
    "home",
    "recipes",
    "shopping",
  ]);
});

test("a blocked storage write keeps retirement in memory without affecting another account", () => {
  const saved = new Map([[introductionStorageKey("alice"), "home"]]);
  let blocked = true;
  let notifications = 0;
  const store = createIntroductionStore(
    () => ({
      getItem: (key) => saved.get(key) ?? null,
      setItem(key, value) {
        if (blocked) throw new Error("Storage blocked");
        saved.set(key, value);
      },
    }),
    () => notifications++,
  );
  store.retire("alice", ["recipes"]);
  expect(store.snapshot("alice")).toBe("home,recipes");
  expect(store.snapshot("bob")).toBe("");
  expect(store.snapshot(null)).toBe("");
  blocked = false;
  store.retire("alice", ["shopping"]);
  expect(saved.get(introductionStorageKey("alice"))).toBe(
    "home,recipes,shopping",
  );
  saved.set(
    introductionStorageKey("alice"),
    "home,recipes,shopping,future-feature",
  );
  store.invalidate(introductionStorageKey("alice"));
  store.retire("alice", ["home"]);
  expect(store.snapshot("alice")).toBe("future-feature,home,recipes,shopping");
  expect(notifications).toBe(3);
});
