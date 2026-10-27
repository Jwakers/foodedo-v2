import { expect, test } from "@playwright/test";
import {
  POST,
  GET,
} from "../../src/app/api/product-events/[...path]/route.web";

test("the web proxy forwards the event body to EU without cookies, auth or referrer headers", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "test-key";
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  globalThis.fetch = async (input, options) => {
    calls.push({ url: String(input), options });
    return new Response("ok", {
      headers: { "set-cookie": "unwanted=1", "content-type": "text/plain" },
    });
  };
  try {
    const response = await POST(
      new Request("https://www.foodedo.com/ingest/e/?v=1", {
        method: "POST",
        body: '{"event":"plan_saved"}',
        headers: {
          cookie: "__session=secret",
          authorization: "Bearer secret",
          referer: "https://www.foodedo.com/?secret=1",
          "content-type": "application/json",
        },
      }),
      { params: Promise.resolve({ path: ["e"] }) },
    );
    expect(calls[0].url).toBe("https://eu.i.posthog.com/e/?v=1");
    expect(calls[0].options?.headers).toEqual({
      "Content-Type": "application/json",
    });
    expect(
      new TextDecoder().decode(calls[0].options?.body as ArrayBuffer),
    ).toBe('{"event":"plan_saved"}');
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("set-cookie")).toBeNull();
    await GET(new Request("https://www.foodedo.com/ingest/static/array.js"), {
      params: Promise.resolve({ path: ["static", "array.js"] }),
    });
    expect(calls[1].url).toBe(
      "https://eu-assets.i.posthog.com/static/array.js",
    );
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    expect(
      (
        await GET(new Request("https://www.foodedo.com/ingest/e"), {
          params: Promise.resolve({ path: ["e"] }),
        })
      ).status,
    ).toBe(404);
    expect(calls).toHaveLength(2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
    if (originalHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    else process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost;
  }
});
