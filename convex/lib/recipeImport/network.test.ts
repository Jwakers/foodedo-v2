// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { readBoundedBytes, safeFetch } from "./network";
import { extractUrlCandidate } from "./source";

const transport = vi.hoisted(() => ({
  fetch: vi.fn(),
  destroy: vi.fn(async () => {}),
}));
vi.mock("undici", () => ({
  fetch: transport.fetch,
  Agent: class {
    compose() {
      return { destroy: transport.destroy };
    }
  },
  interceptors: { dns: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
});

function response(options: ResponseInit = {}) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("recipe content"));
    },
    cancel,
  });
  return { value: new Response(body, options), cancel };
}

test.each([403, 500])(
  "HTTP %i rejection cancels the body and releases the connection",
  async (status) => {
    const source = response({ status });
    transport.fetch.mockResolvedValue(source.value);
    await expect(
      safeFetch("https://public.example/recipe", 100, "html"),
    ).rejects.toMatchObject({
      code: status === 403 ? "source_blocked" : "source_unreachable",
    });
    expect(source.cancel).toHaveBeenCalled();
    expect(transport.destroy).toHaveBeenCalled();
  },
);

test("oversized headers and unsupported content types release unopened bodies", async () => {
  const variants: Record<string, string>[] = [
    { "content-length": "999" },
    { "content-type": "application/json" },
  ];
  for (const headers of variants) {
    const source = response({ headers });
    transport.fetch.mockResolvedValue(source.value);
    const attempt =
      "content-length" in headers
        ? safeFetch("https://public.example/recipe", 100, "html")
        : extractUrlCandidate("https://public.example/recipe");
    await expect(attempt).rejects.toMatchObject({
      code: "unsupported_content",
    });
    expect(source.cancel).toHaveBeenCalled();
    expect(transport.destroy).toHaveBeenCalled();
  }
});

test("redirects cancel intermediate bodies and reject unsafe destinations", async () => {
  const source = response({
    status: 302,
    headers: { location: "http://localhost/private" },
  });
  transport.fetch.mockResolvedValue(source.value);
  await expect(
    safeFetch("https://public.example/recipe", 100, "html"),
  ).rejects.toMatchObject({ code: "unsafe_url" });
  expect(source.cancel).toHaveBeenCalled();
  expect(transport.fetch).toHaveBeenCalledTimes(1);
  expect(transport.destroy).toHaveBeenCalled();
});

test("stream limits cancel the reader; cleanup failures cannot replace the import failure", async () => {
  const source = response();
  source.cancel.mockRejectedValueOnce(new Error("Cancellation failed"));
  transport.fetch.mockResolvedValue(source.value);
  transport.destroy.mockRejectedValueOnce(new Error("Cleanup failed"));
  const fetched = await safeFetch("https://public.example/recipe", 100, "html");
  await expect(readBoundedBytes(fetched, 2)).rejects.toMatchObject({
    code: "unsupported_content",
  });
  expect(source.cancel).toHaveBeenCalled();
  expect(transport.destroy).toHaveBeenCalled();
});

test("successful and broken streams release their connections", async () => {
  transport.fetch.mockResolvedValueOnce(new Response("Soup"));
  expect(
    new TextDecoder().decode(
      await readBoundedBytes(
        await safeFetch("https://public.example/recipe", 100, "html"),
        100,
      ),
    ),
  ).toBe("Soup");
  expect(transport.destroy).toHaveBeenCalled();
  const error = new Error("Broken stream");
  transport.fetch.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(error);
        },
      }),
    ),
  );
  await expect(
    readBoundedBytes(
      await safeFetch("https://public.example/recipe", 100, "html"),
      100,
    ),
  ).rejects.toBe(error);
  expect(transport.destroy).toHaveBeenCalledTimes(2);
});
