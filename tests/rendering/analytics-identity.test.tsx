// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";

type IdentityResources = {
  user: { id: string } | null;
  session: { id: string } | null;
  client: {
    signUp: { status: string | null; createdSessionId: string | null };
    signIn: { status: string | null; createdSessionId: string | null };
  };
};
const state = vi.hoisted(() => ({
  effect: undefined as (() => (() => void) | undefined) | undefined,
  callbacks: new Set<(resources: IdentityResources) => void>(),
  user: null as { id: string } | null,
  session: null as { id: string } | null,
  enabled: false,
  identify: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => (() => void) | undefined) => {
    state.effect = effect;
  },
}));
vi.mock("@clerk/react", () => ({
  useClerk: () => ({
    get user() {
      return state.user;
    },
    get session() {
      return state.session;
    },
    addListener: (callback: (resources: IdentityResources) => void) => {
      state.callbacks.add(callback);
      return () => {
        state.callbacks.delete(callback);
      };
    },
  }),
}));
vi.mock("@/lib/analytics", () => ({
  analyticsEnabled: () => state.enabled,
  identify: state.identify,
  reset: state.reset,
  track: state.track,
}));

function emit(userId: string | null) {
  state.user = userId ? { id: userId } : null;
  state.session = userId ? { id: `session-${userId}` } : null;
  state.callbacks.forEach((callback) =>
    callback({
      user: state.user,
      session: state.session,
      client: {
        signUp: { status: null, createdSessionId: null },
        signIn: { status: null, createdSessionId: null },
      },
    }),
  );
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.callbacks.clear();
  state.enabled = false;
  state.user = null;
  state.session = null;
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

test("Clerk remains subscribed while opted out and preference changes synchronise the current session", async () => {
  const { AnalyticsIdentity } =
    await import("../../src/components/analytics-identity");
  AnalyticsIdentity();
  const cleanup = state.effect?.();
  expect(state.callbacks.size).toBe(1);
  emit("user-a");
  emit(null);
  emit("user-b");
  expect(state.identify.mock.calls).toEqual([["user-a"], ["user-b"]]);
  expect(state.reset).toHaveBeenCalledTimes(1);
  state.identify.mockClear();
  state.enabled = true;
  window.dispatchEvent(new Event("foodedo:analytics-preference"));
  expect(state.identify).toHaveBeenCalledExactlyOnceWith("user-b");
  expect(state.track).not.toHaveBeenCalled();
  cleanup?.();
  window.dispatchEvent(new Event("foodedo:analytics-preference"));
  expect(state.callbacks.size).toBe(0);
  expect(state.identify).toHaveBeenCalledTimes(1);
});

test("Strict Mode effect replay cleans up subscriptions and dedupes Clerk completion events", async () => {
  state.enabled = true;
  const { AnalyticsIdentity } =
    await import("../../src/components/analytics-identity");
  AnalyticsIdentity();
  const cleanup = state.effect?.();
  cleanup?.();
  const finalCleanup = state.effect?.();
  expect(state.callbacks.size).toBe(1);
  const completed: IdentityResources = {
    user: { id: "user-a" },
    session: { id: "session-a" },
    client: {
      signUp: { status: "complete", createdSessionId: "session-a" },
      signIn: { status: null, createdSessionId: null },
    },
  };
  state.callbacks.forEach((callback) => {
    callback(completed);
    callback(completed);
  });
  expect(state.track).toHaveBeenCalledExactlyOnceWith("signed_up", {});
  finalCleanup?.();
});
