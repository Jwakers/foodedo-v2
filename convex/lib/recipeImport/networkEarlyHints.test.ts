// @vitest-environment node
import { createServer } from "node:http";
import { expect, test, vi } from "vitest";

// Allow only this test's loopback fixture. Production address rejection is
// exercised separately in network.test.ts and the domain security tests.
vi.mock("../../../src/lib/domain/recipe-import", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/lib/domain/recipe-import")
    >();
  return {
    ...actual,
    isPrivateOrReservedAddress: (address: string) =>
      address === "127.0.0.1"
        ? false
        : actual.isPrivateOrReservedAddress(address),
  };
});
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "127.0.0.1", family: 4 }],
}));

import { readBoundedBytes, safeFetch } from "./network";

test("reads the final recipe after multiple HTTP 103 Early Hints responses", async () => {
  let receivedHost = "";
  const server = createServer((request, response) => {
    receivedHost = request.headers.host ?? "";
    response.writeEarlyHints({ link: "</recipe.css>; rel=preload; as=style" });
    response.writeEarlyHints({ link: "</recipe.js>; rel=preload; as=script" });
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<h1>Soup</h1><p>Simmer the carrots.</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("No port");
    const host = `recipe.example:${address.port}`;
    const response = await safeFetch(`http://${host}/soup`, 1000, "html");
    expect(response.status).toBe(200);
    expect(
      new TextDecoder().decode(await readBoundedBytes(response, 1000)),
    ).toContain("Simmer the carrots.");
    expect(receivedHost).toBe(host);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
