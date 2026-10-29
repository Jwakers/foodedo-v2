import { expect, test } from "@playwright/test";
import { createRecipeSaveConfirmation } from "../../src/lib/domain/recipe-save-confirmation";

function setup() {
  let shown = 0;
  let dismissed = 0;
  const confirmation = createRecipeSaveConfirmation(
    () => shown++,
    () => dismissed++,
  );
  confirmation.setIdentity("alice");
  return { confirmation, shown: () => shown, dismissed: () => dismissed };
}

test("feedback waits for success; an unsave cancels pending and visible confirmations across surfaces", () => {
  const { confirmation, shown, dismissed } = setup();
  const complete = confirmation.begin("alice", "pasta", true);
  expect(shown()).toBe(0);
  confirmation.begin("alice", "pasta", false)(false);
  complete(true);
  expect(shown()).toBe(0);
  confirmation.begin("alice", "pasta", true)(false);
  expect(shown()).toBe(0);
  confirmation.begin("alice", "pasta", true)(true);
  expect(shown()).toBe(1);
  const before = dismissed();
  confirmation.begin("alice", "pasta", false);
  expect(dismissed()).toBe(before + 1);
});

test("switching accounts dismisses feedback and rejects late completions even after switching back", () => {
  const { confirmation, shown, dismissed } = setup();
  const complete = confirmation.begin("alice", "pasta", true);
  confirmation.setIdentity("bob");
  complete(true);
  expect(shown()).toBe(0);
  confirmation.setIdentity("alice");
  complete(true);
  expect(shown()).toBe(0);
  confirmation.begin("alice", "pasta", true)(true);
  const before = dismissed();
  confirmation.setIdentity(null);
  expect(dismissed()).toBe(before + 1);
});
