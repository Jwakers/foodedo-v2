import { expect, test } from "@playwright/test";
import { assertIosReleaseEnvironment } from "../../config/ios-release";

const releaseEnvironment = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
  NEXT_PUBLIC_CONVEX_URL: "https://release-example.convex.cloud",
  NEXT_PUBLIC_CONVEX_SITE_URL: "https://release-example.convex.site",
  NEXT_PUBLIC_SITE_URL: "https://www.foodedo.com",
};

test("release environment requires production identity and public HTTPS origins", () => {
  expect(() => assertIosReleaseEnvironment(releaseEnvironment)).not.toThrow();
  for (const key of [undefined, "", "pk_test_fixture"]) {
    expect(() =>
      assertIosReleaseEnvironment({
        ...releaseEnvironment,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
      }),
    ).toThrow("production Clerk");
  }
  for (const name of [
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    for (const value of [
      undefined,
      "http://www.foodedo.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://192.168.1.2",
      "https://device.local",
      "https://example.com/path",
      "https://user:password@example.com",
      "https://example.com?token=private",
    ]) {
      expect(() =>
        assertIosReleaseEnvironment({ ...releaseEnvironment, [name]: value }),
      ).toThrow(name);
    }
  }
});
