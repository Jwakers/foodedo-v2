// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const native = vi.hoisted(() => ({
  available: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  loadUI: vi.fn(),
  before: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isPluginAvailable: native.available },
  registerPlugin: () => ({
    getClientToken: native.get,
    setClientToken: native.set,
  }),
}));
vi.mock("@clerk/clerk-js", () => ({
  Clerk: class {
    frontendApi = "clerk.example.com";
    __internal_onBeforeRequest = native.before;
    __internal_onAfterResponse = native.after;
  },
}));
vi.mock("@clerk/shared/loadClerkJsScript", () => ({
  loadClerkUIScript: native.loadUI,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  native.available.mockReturnValue(true);
  native.get.mockResolvedValue({});
  native.set.mockResolvedValue(undefined);
  native.loadUI.mockResolvedValue(null);
  vi.stubGlobal("window", { __internal_ClerkUICtor: class {} });
});
afterEach(() => vi.unstubAllGlobals());

test("native bootstrap pins its UI and shares one initialization with secure request hooks", async () => {
  const { nativeClerkOptions } =
    await import("../../src/lib/platform/capacitor/clerk-native-client");
  const first = nativeClerkOptions("fixture-key");
  expect(nativeClerkOptions("fixture-key")).toBe(first);
  const options = await first;
  expect(options.standardBrowser).toBe(false);
  expect(options.allowedRedirectProtocols).toEqual(["capacitor:"]);
  expect(native.loadUI).toHaveBeenCalledExactlyOnceWith({
    publishableKey: "fixture-key",
    __internal_clerkUIVersion: "1.42.4",
  });
  expect(native.get).toHaveBeenCalledExactlyOnceWith({
    frontendApiHost: "clerk.example.com",
  });
  const request = { url: new URL("https://clerk.example.com/v1/client") };
  await native.after.mock.calls[0][0](
    request,
    new Response("{}", { headers: { Authorization: "client-token" } }),
  );
  expect(native.set).toHaveBeenCalledWith({
    frontendApiHost: "clerk.example.com",
    token: "client-token",
  });
  expect(nativeClerkOptions("fixture-key")).toBe(first);
});

test("Keychain and UI failures do not poison the retry cache", async () => {
  const { nativeClerkOptions } =
    await import("../../src/lib/platform/capacitor/clerk-native-client");
  native.get.mockRejectedValueOnce(new Error("Keychain locked"));
  await expect(nativeClerkOptions("fixture-key")).rejects.toThrow(
    "Keychain locked",
  );
  expect(native.loadUI).not.toHaveBeenCalled();
  native.loadUI.mockRejectedValueOnce(new Error("Offline"));
  await expect(nativeClerkOptions("fixture-key")).rejects.toThrow("Offline");
  await expect(nativeClerkOptions("fixture-key")).resolves.toMatchObject({
    standardBrowser: false,
  });
  expect(native.get).toHaveBeenCalledTimes(3);
});

test("missing native storage fails before any UI or token access", async () => {
  native.available.mockReturnValue(false);
  const { nativeClerkOptions } =
    await import("../../src/lib/platform/capacitor/clerk-native-client");
  await expect(nativeClerkOptions("fixture-key")).rejects.toThrow(
    "unavailable",
  );
  expect(native.get).not.toHaveBeenCalled();
  expect(native.loadUI).not.toHaveBeenCalled();
});
