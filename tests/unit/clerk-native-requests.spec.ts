import { expect, test } from "@playwright/test";
import { nativeClerkRequestHooks } from "../../src/lib/platform/capacitor/clerk-native-requests";

test("native client identity survives a fresh adapter and rotates with Clerk responses", async () => {
  let persisted: string | null = null;
  const store = {
    get: async () => persisted,
    set: async (token: string) => {
      persisted = token;
    },
  };
  const hooks = nativeClerkRequestHooks("clerk.example.com", store);
  const initial = {
    url: new URL("https://clerk.example.com/v1/client"),
    credentials: "include" as RequestCredentials,
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: "old-browser-header",
    }),
  };
  await hooks.before(initial);
  expect(initial.credentials).toBe("omit");
  expect(initial.url.searchParams.getAll("_is_native")).toEqual(["1"]);
  expect(new Headers(initial.headers).has("Authorization")).toBe(false);
  expect(new Headers(initial.headers).get("Content-Type")).toBe(
    "application/json",
  );
  await hooks.after(
    initial,
    new Response("{}", {
      headers: { Authorization: "Bearer client-token-one" },
    }),
  );
  const restored = nativeClerkRequestHooks("clerk.example.com", store);
  const next = {
    url: new URL("https://clerk.example.com/v1/client/sign_ins"),
    headers: new Headers(),
  };
  await restored.before(next);
  expect(new Headers(next.headers).get("Authorization")).toBe(
    "Bearer client-token-one",
  );
  await restored.after(
    next,
    new Response("{}", { headers: { Authorization: "client-token-two" } }),
  );
  await hooks.before(initial);
  expect(new Headers(initial.headers).get("Authorization")).toBe(
    "Bearer client-token-two",
  );
  expect(initial.url.searchParams.getAll("_is_native")).toEqual(["1"]);
});

test("tokens never cross hosts and secure-storage failures stop authentication", async () => {
  let reads = 0;
  let writes = 0;
  const hooks = nativeClerkRequestHooks("clerk.example.com", {
    get: async () => {
      reads++;
      return "private-client-token";
    },
    set: async () => {
      writes++;
    },
  });
  for (const url of [
    undefined,
    new URL("https://clerk.example.com.attacker.test/v1/client"),
    new URL("http://clerk.example.com/v1/client"),
    new URL("https://user:password@clerk.example.com/v1/client"),
  ]) {
    await expect(hooks.before({ url })).rejects.toThrow(
      "unexpected request host",
    );
    await expect(
      hooks.after(
        { url },
        new Response("{}", {
          headers: { Authorization: "private-client-token" },
        }),
      ),
    ).rejects.toThrow("unexpected request host");
  }
  expect(reads).toBe(0);
  expect(writes).toBe(0);
  const broken = nativeClerkRequestHooks("clerk.example.com", {
    get: async () => {
      throw new Error("Keychain locked");
    },
    set: async () => {
      throw new Error("Keychain unavailable");
    },
  });
  const request = { url: new URL("https://clerk.example.com/v1/client") };
  await expect(broken.before(request)).rejects.toThrow("Keychain locked");
  await expect(
    broken.after(
      request,
      new Response("{}", { headers: { Authorization: "new-client-token" } }),
    ),
  ).rejects.toThrow("Keychain unavailable");
});
