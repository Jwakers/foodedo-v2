// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
const provider = vi.hoisted(() => ({
  generateText: vi.fn(),
  generateImage: vi.fn(),
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: provider.generateText,
  generateImage: provider.generateImage,
}));
import { gatewayGenerationClient, type ModelEvent } from "./models";
import { generationConfig } from "./config";
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  provider.generateText.mockReset();
  provider.generateImage.mockReset();
});
const valid = {
  output: { dish: "pie" },
  response: { modelId: generationConfig.textModel },
  usage: { inputTokens: 10, outputTokens: 20 },
  providerMetadata: { gateway: { cost: "0.012" } },
};
test("selection uses lower reasoning while writing and culinary review retain medium", async () => {
  provider.generateText.mockResolvedValue(valid);
  const events: ModelEvent[] = [];
  const phases: string[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 300000,
    async (event) => {
      events.push(event);
    },
    async (phase) => {
      phases.push(phase);
    },
  );
  for (const role of ["selection", "authoring", "culinary_review"])
    await client.text(role, z.object({ dish: z.string() }), "policy", {});
  expect(
    provider.generateText.mock.calls.map(
      ([args]) => args.providerOptions.openai.reasoningEffort,
    ),
  ).toEqual(["low", "medium", "medium"]);
  expect(
    provider.generateText.mock.calls.every(([args]) => args.maxRetries === 0),
  ).toBe(true);
  expect(phases).toEqual(["selection", "authoring", "culinary_review"]);
  expect(events.every((event) => event.costUsd === 0.012)).toBe(true);
});
test("invalid structured output is logged as failed without losing known usage", async () => {
  provider.generateText.mockResolvedValue({ ...valid, output: { dish: 4 } });
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 300000,
    async (event) => {
      events.push(event);
    },
  );
  await expect(
    client.text("authoring", z.object({ dish: z.string() }), "policy", {}),
  ).rejects.toThrow();
  expect(events[0]).toMatchObject({
    outcome: "failed",
    costUsd: 0.012,
    inputTokens: 10,
  });
});

test("Nano Banana Pro uses native image-only generation at 2K and records usage", async () => {
  provider.generateText.mockResolvedValue({
    ...valid,
    response: { modelId: "gemini-3-pro-image" },
    files: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/png" }],
  });
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 300000,
    async (event) => {
      events.push(event);
    },
  );
  await client.image("A real meal photograph");
  expect(provider.generateText).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "google/gemini-3-pro-image",
      providerOptions: {
        google: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
        },
      },
      maxRetries: 0,
    }),
  );
  expect(provider.generateImage).not.toHaveBeenCalled();
  expect(events[0]).toMatchObject({
    role: "photography",
    resolvedModel: "gemini-3-pro-image",
    costUsd: 0.012,
    outcome: "succeeded",
  });
});
test.each([
  { files: [] },
  { files: [{ mediaType: "image/png" }, { mediaType: "image/png" }] },
])("Google image output requires exactly one image", async ({ files }) => {
  provider.generateText.mockResolvedValue({ ...valid, files });
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 300000,
    async (event) => {
      events.push(event);
    },
  );
  await expect(client.image("A meal")).rejects.toThrow("exactly one");
  expect(events[0]).toMatchObject({
    role: "photography",
    outcome: "failed",
    costUsd: 0.012,
  });
  expect(provider.generateText).toHaveBeenCalledOnce();
});
test("historical image configurations keep their original default quality and aspect ratio", async () => {
  provider.generateImage.mockResolvedValue({
    image: { uint8Array: new Uint8Array([1]), mediaType: "image/png" },
  });
  const client = gatewayGenerationClient(
    {
      ...generationConfig,
      imageModel: "openai/gpt-image-2",
      imageSize: undefined,
    },
    Date.now() + 300000,
    async () => {},
  );
  await client.image("A meal");
  expect(provider.generateImage.mock.calls[0][0]).toMatchObject({
    model: "openai/gpt-image-2",
    aspectRatio: "16:9",
  });
  expect(provider.generateImage.mock.calls[0][0]).not.toHaveProperty(
    "providerOptions",
  );
});

test("writing can complete beyond the old 90-second cutoff without reducing reasoning quality", async () => {
  vi.useFakeTimers();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => new AbortController().signal);
  provider.generateText.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 100_000);
    return valid;
  });
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 480_000,
    async (event) => {
      events.push(event);
    },
  );
  await expect(
    client.text("authoring", z.object({ dish: z.string() }), "policy", {}),
  ).resolves.toEqual({ dish: "pie" });
  expect(timeout).toHaveBeenCalledWith(180_000);
  expect(events[0]).toMatchObject({
    durationMs: 100_000,
    outcome: "succeeded",
  });
  expect(
    provider.generateText.mock.calls[0][0].providerOptions.openai
      .reasoningEffort,
  ).toBe("medium");
  timeout.mockRestore();
  vi.useRealTimers();
});

test("request timeouts are actionable, recorded as timed out and never retried automatically", async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(controller.signal);
  provider.generateText.mockImplementation(async () => {
    controller.abort(new DOMException("Timeout", "TimeoutError"));
    throw new Error(
      "Invalid error response format: Gateway request failed: The operation was aborted due to timeout",
    );
  });
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 480_000,
    async (event) => {
      events.push(event);
    },
  );
  await expect(
    client.text("authoring", z.object({ dish: z.string() }), "policy", {}),
  ).rejects.toThrow("Recipe writing timed out after 180 seconds");
  expect(provider.generateText).toHaveBeenCalledOnce();
  expect(events[0]).toMatchObject({ outcome: "timed_out", role: "authoring" });
  expect(events[0].costUsd).toBeUndefined();
  timeout.mockRestore();
});

test("review timeout is bounded by the overall time remaining", async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, "timeout")
    .mockReturnValue(controller.signal);
  provider.generateText.mockImplementation(async () => {
    controller.abort();
    throw new Error("Aborted");
  });
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 5_000,
    async () => {},
  );
  await expect(
    client.text(
      "culinary_review",
      z.object({ dish: z.string() }),
      "policy",
      {},
    ),
  ).rejects.toThrow("exhausted the remaining time");
  expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(5_000);
  expect(timeout.mock.calls[0][0]).toBeGreaterThan(0);
  timeout.mockRestore();
});

test("upstream Gateway timeouts are distinguished from Foodedo's own cutoff", async () => {
  provider.generateText.mockRejectedValue(
    new Error("Invalid error response format", {
      cause: new Error("Gateway operation was aborted due to timeout"),
    }),
  );
  const events: ModelEvent[] = [];
  const client = gatewayGenerationClient(
    generationConfig,
    Date.now() + 480_000,
    async (event) => {
      events.push(event);
    },
  );
  await expect(
    client.text("authoring", z.object({ dish: z.string() }), "policy", {}),
  ).rejects.toThrow("AI provider timed out during recipe writing");
  expect(events[0].outcome).toBe("timed_out");
  expect(provider.generateText).toHaveBeenCalledOnce();
});
