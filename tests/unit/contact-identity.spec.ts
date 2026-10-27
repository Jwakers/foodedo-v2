import { expect, test } from "@playwright/test";
import { resolveContactUserId } from "../../src/features/contact/contact-identity";

test("current authenticated identity wins over a forwarded app identity", () => {
  expect(
    resolveContactUserId(
      { isSignedIn: true, userId: "user_current" },
      "user_app",
    ),
  ).toBe("user_current");
});

test("guests and loading sessions do not leak a stale user ID", () => {
  expect(
    resolveContactUserId({ isSignedIn: false, userId: "user_stale" }),
  ).toBe("");
  expect(resolveContactUserId({ userId: "user_stale" })).toBe("");
  expect(resolveContactUserId({ isSignedIn: true, userId: null })).toBe("");
});

test("a signed-in app identity survives opening an unauthenticated external browser", () => {
  expect(resolveContactUserId({ isSignedIn: false }, "user_app")).toBe(
    "user_app",
  );
});
