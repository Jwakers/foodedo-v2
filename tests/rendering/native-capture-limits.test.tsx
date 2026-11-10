// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";

const state = vi.hoisted(() => ({
  effect: undefined as (() => (() => void) | undefined) | undefined,
  foreground: undefined as ((event: { isActive: boolean }) => void) | undefined,
  begin: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
  acknowledge: vi.fn(),
  claim: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  jobs: [] as { status: string }[],
  refs: [] as { current: unknown }[],
  refIndex: 0,
  dependencies: [] as unknown[],
  latestContext: undefined as (() => unknown) | undefined,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (
    effect: () => (() => void) | undefined,
    dependencies: unknown[],
  ) => {
    state.effect = effect;
    state.dependencies = dependencies;
  },
  useRef: (value: unknown) => {
    const index = state.refIndex++;
    return (state.refs[index] ??= { current: value });
  },
  useEffectEvent: (callback: () => unknown) => {
    state.latestContext = callback;
    return () => state.latestContext?.();
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_name: string, callback: typeof state.foreground) => {
      state.foreground = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@clerk/react", () => ({ useClerk: () => ({ openSignIn: vi.fn() }) }));
vi.mock("convex/react", () => ({
  useMutation: () => state.begin,
  useQuery: () => state.jobs,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: state.error, dismiss: state.dismiss }),
}));
vi.mock("@/features/auth/use-foodedo-auth", () => ({
  useFoodedoAuth: () => ({ status: "authenticated", userId: "alice" }),
}));
vi.mock("@/lib/platform/recipe-import-permission", () => ({
  confirmRecipeImportSharing: state.confirm,
}));
vi.mock("@/lib/platform/auth-intent-store", () => ({
  createRecipeImportIntentStore: () => ({ read: async () => null }),
}));
vi.mock("@/lib/platform/capacitor/recipe-capture", () => ({
  recipeCapture: {
    peek: async () => ({
      capture: {
        id: "capture-1",
        url: "https://example.com/recipe",
        // Existing native inbox entries contain fractional milliseconds.
        createdAt: Date.now() + 0.25,
      },
    }),
    claim: state.claim,
    acknowledge: state.acknowledge,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.effect = undefined;
  state.foreground = undefined;
  state.refs = [];
  state.refIndex = 0;
  state.jobs = [];
  state.confirm.mockReturnValue(true);
  state.claim.mockResolvedValue(undefined);
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function pauseCapture() {
  state.begin.mockRejectedValue(
    new ConvexError({
      code: "IMPORTED_RECIPE_LIMIT",
      message: "Remove an imported recipe before adding another.",
    }),
  );
  const { NativeRecipeCaptures } =
    await import("@/features/recipes/native-recipe-captures");
  const element = NativeRecipeCaptures();
  const Coordinator = element!.type as () => null;
  Coordinator();
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(state.error).toHaveBeenCalledTimes(1));
  return cleanup;
}

test("a limit pause keeps its retry action available and retry can acknowledge the capture", async () => {
  const cleanup = await pauseCapture();
  const options = state.error.mock.calls[0][1];
  expect(options.duration).toBe(Infinity);
  expect(state.acknowledge).not.toHaveBeenCalled();
  state.begin.mockResolvedValue("import-1");
  options.action.onClick();
  await vi.waitFor(() =>
    expect(state.acknowledge).toHaveBeenCalledWith({
      id: "capture-1",
      owner: "alice",
    }),
  );
  expect(state.dismiss).toHaveBeenCalledWith("native-capture-limit");
  expect(state.confirm).toHaveBeenCalledTimes(1);
  expect(state.push).toHaveBeenCalledWith("/recipes/import?job=import-1");
  cleanup?.();
});

test("live job updates do not restart consent or interrupt the inbox handoff", async () => {
  let claimed!: () => void;
  state.claim.mockReturnValue(
    new Promise<void>((resolve) => {
      claimed = resolve;
    }),
  );
  state.begin.mockResolvedValue("import-progress");
  const { NativeRecipeCaptures } =
    await import("@/features/recipes/native-recipe-captures");
  const Coordinator = NativeRecipeCaptures()!.type as () => null;
  Coordinator();
  let cleanup = state.effect?.();
  const previousDependencies = state.dependencies;
  await vi.waitFor(() => expect(state.claim).toHaveBeenCalledTimes(1));
  state.jobs = [{ status: "processing" }];
  state.refIndex = 0;
  Coordinator();
  // Commit the rerender, applying the same dependency comparison as React.
  if (
    state.dependencies.some(
      (value, index) => !Object.is(value, previousDependencies[index]),
    )
  ) {
    cleanup?.();
    cleanup = state.effect?.();
  }
  claimed();
  await vi.waitFor(() => expect(state.acknowledge).toHaveBeenCalledTimes(1));
  expect(state.confirm).toHaveBeenCalledTimes(1);
  expect(state.begin).toHaveBeenCalledTimes(1);
  expect(state.push).toHaveBeenCalledWith(
    "/recipes/import?job=import-progress",
  );
  cleanup?.();
});

test("a server-accepted capture is acknowledged even if the effect was cleaned up", async () => {
  let accepted!: (id: string) => void;
  state.begin.mockReturnValue(
    new Promise<string>((resolve) => {
      accepted = resolve;
    }),
  );
  const { NativeRecipeCaptures } =
    await import("@/features/recipes/native-recipe-captures");
  const Coordinator = NativeRecipeCaptures()!.type as () => null;
  Coordinator();
  const cleanup = state.effect?.();
  await vi.waitFor(() => expect(state.begin).toHaveBeenCalledTimes(1));
  cleanup?.();
  accepted("accepted-import");
  await vi.waitFor(() => expect(state.acknowledge).toHaveBeenCalledTimes(1));
  expect(state.push).not.toHaveBeenCalled();
});

test("foregrounding rechecks a paused capture after its limit has cleared", async () => {
  const cleanup = await pauseCapture();
  await vi.waitFor(() => expect(state.foreground).toBeTypeOf("function"));
  state.begin.mockResolvedValue("import-2");
  state.foreground?.({ isActive: true });
  await vi.waitFor(() => expect(state.acknowledge).toHaveBeenCalledTimes(1));
  expect(state.begin).toHaveBeenCalledTimes(2);
  cleanup?.();
});
