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
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => (() => void) | undefined) => {
    state.effect = effect;
  },
  useRef: (value: unknown) => ({ current: value }),
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
  useQuery: () => [],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: state.error, dismiss: state.dismiss }),
}));
vi.mock("@/features/auth/use-foodedo-auth", () => ({
  useFoodedoAuth: () => ({ status: "authenticated", userId: "alice" }),
}));
vi.mock("@/lib/platform/recipe-import-permission", () => ({
  confirmRecipeImportSharing: () => true,
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
        createdAt: Date.now(),
      },
    }),
    claim: vi.fn(),
    acknowledge: state.acknowledge,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.effect = undefined;
  state.foreground = undefined;
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
  cleanup?.();
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
