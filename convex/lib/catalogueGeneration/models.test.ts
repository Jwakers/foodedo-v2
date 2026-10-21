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
