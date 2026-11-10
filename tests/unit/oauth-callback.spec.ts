import { expect, test } from "@playwright/test";
import { oauthCallbackFailureCode } from "../../src/lib/domain/oauth-callback";

test("diagnostics retain the provider failure code without callback credentials", () => {
  const url = new URL("com.foodedo.app://callback");
  url.searchParams.set("__clerk_status", "failed");
  url.searchParams.set("__clerk_error_code", "oauth_invalid_state");
  url.searchParams.set("rotating_token_nonce", "private-nonce");
  url.searchParams.set("__clerk_error_message", "private@example.com");
  expect(oauthCallbackFailureCode(url.href)).toBe("oauth_invalid_state");
  url.searchParams.set("__clerk_status", "verified");
  expect(oauthCallbackFailureCode(url.href)).toBeNull();
});

test("missing, ambiguous and non-code values do not expose callback input", () => {
  for (const value of [
    "",
    "private@example.com",
    "https://example.com/secret",
    "eyJhbGciOiJIUzI1NiJ9.secret.signature",
    "a".repeat(81),
    "private_secret_token",
  ]) {
    const url = new URL("com.foodedo.app://callback?__clerk_status=failed");
    url.searchParams.set("__clerk_error_code", value);
    expect(oauthCallbackFailureCode(url.href)).toBe("unspecified");
  }
  expect(
    oauthCallbackFailureCode(
      "com.foodedo.app://callback?__clerk_status=failed&__clerk_error_code=oauth_invalid_state&__clerk_error_code=oauth_other_error",
    ),
  ).toBe("unspecified");
  expect(oauthCallbackFailureCode("not a URL")).toBeNull();
});
