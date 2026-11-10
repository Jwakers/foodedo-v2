// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { readBoundedBytes, safeFetch } from "./network";
import { extractHtmlCandidate, extractUrlCandidate } from "./source";

const transport = vi.hoisted(() => ({
  fetch: vi.fn(),
  destroy: vi.fn(async () => {}),
  agent: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: transport.lookup }));
vi.mock("undici", () => ({
  fetch: transport.fetch,
  Agent: class {
    constructor(options: unknown) {
      transport.agent(options);
      return { destroy: transport.destroy };
    }
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
});

test.each([
  "http://[::1]/recipe",
  "http://[::ffff:127.0.0.1]/recipe",
  "http://[fd00::1]/recipe",
  "http://[fe80::1]/recipe",
  "http://[2001:db8::1]/recipe",
])(
  "private and reserved IPv6 literal %s is rejected before fetch",
  async (url) => {
    await expect(safeFetch(url, 100, "html")).rejects.toMatchObject({
      code: "unsafe_url",
    });
    expect(transport.fetch).not.toHaveBeenCalled();
    expect(transport.destroy).toHaveBeenCalled();
  },
);

test("socket DNS lookup uses only validated addresses and preserves requested address families", async () => {
  transport.fetch.mockResolvedValueOnce(new Response("recipe"));
  const fetched = await safeFetch("https://public.example/recipe", 100, "html");
  await readBoundedBytes(fetched, 100);
  const socketLookup = transport.agent.mock.calls[0][0].connect.lookup;
  const publicAddresses = [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700::1111", family: 6 },
  ];
  const cases: Array<[Record<string, unknown>, unknown[]]> = [
    [{ all: true }, [null, publicAddresses]],
    [{ all: true, family: 6 }, [null, [publicAddresses[1]]]],
    [{ family: 4 }, [null, publicAddresses[0].address, 4]],
  ];
  for (const [options, expected] of cases) {
    transport.lookup.mockResolvedValueOnce(publicAddresses);
    const callback = vi.fn();
    socketLookup("public.example", options, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(...expected));
  }
  expect(transport.lookup).toHaveBeenCalledWith("public.example", {
    all: true,
    verbatim: true,
  });
  for (const addresses of [
    [],
    [...publicAddresses, { address: "127.0.0.1", family: 4 }],
  ]) {
    transport.lookup.mockResolvedValueOnce(addresses);
    const callback = vi.fn();
    socketLookup("public.example", { all: true }, callback);
    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ code: "EUNSAFEADDRESS" }),
        [],
      ),
    );
  }
  transport.lookup.mockRejectedValueOnce(
    Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" }),
  );
  const callback = vi.fn();
  socketLookup("public.example", { all: true }, callback);
  await vi.waitFor(() =>
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ENOTFOUND" }),
      [],
    ),
  );
});

test("HTTP 200 publisher verification pages are blocked sources, not non-recipes", async () => {
  transport.fetch.mockResolvedValueOnce(
    new Response(
      "<title>Pardon Our Interruption</title><h1>Pardon Our Interruption</h1><p>Something about your browser made us think you were a bot.</p>",
      { headers: { "content-type": "text/html" } },
    ),
  );
  await expect(
    extractUrlCandidate("https://public.example/recipe"),
  ).rejects.toMatchObject({ code: "source_blocked" });
  expect(transport.destroy).toHaveBeenCalled();
});

test("incidental bot-check wording cannot hide a readable recipe", () => {
  const candidate = extractHtmlCandidate(
    "<title>Soup</title><article><h1>Soup</h1><p>Pardon Our Interruption: make sure that cookies and JavaScript are enabled.</p><h2>Ingredients</h2><p>2 carrots</p><h2>Method</h2><p>Simmer until soft.</p></article>",
    "https://public.example/soup",
  );
  expect(candidate.sourceText).toContain("2 carrots");
  expect(candidate.sourceText).toContain("Simmer until soft");
});

test("transport diagnostics use fixed reason labels without source URLs or messages", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    transport.fetch.mockRejectedValueOnce(
      new TypeError("fetch failed https://private.example/token", {
        cause: Object.assign(new Error("private transport detail"), {
          code: "ECONNRESET",
        }),
      }),
    );
    await expect(
      safeFetch("https://public.example/recipe?secret=private", 100, "html"),
    ).rejects.toMatchObject({ code: "source_unreachable" });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "recipe_import_network_failure",
      { stage: "fetch", expected: "html", reason: "ECONNRESET" },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    expect(transport.destroy).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});

test("an expired acquisition deadline starts no request and releases the dispatcher", async () => {
  await expect(
    safeFetch("https://public.example/recipe", 100, "html", Date.now() - 1),
  ).rejects.toMatchObject({ code: "timed_out" });
  expect(transport.fetch).not.toHaveBeenCalled();
  expect(transport.destroy).toHaveBeenCalled();
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
