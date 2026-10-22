import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Advance the clock of an isolated production server, not production data or
// application cache settings. Restore the build artifacts after verification.
const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = await mkdtemp(path.join(tmpdir(), "foodedo-recipe-cache-"));
const port = Number(process.env.PUBLIC_RECIPE_CACHE_TEST_PORT || 3103);
const base = `http://127.0.0.1:${port}`;
const freshSlug = "public-recipe-new-after-build-fixture";
const missingSlug = "public-recipe-missing-then-published-fixture";
const stateFile = path.join(scratch, "state.json");
let server;
let output = "";
const artifacts = ["server/app", "cache/fetch-cache"];
const captured = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function state(patch = {}) {
  const current = JSON.parse(await readFile(stateFile, "utf8"));
  if (Object.keys(patch).length)
    await writeFile(stateFile, JSON.stringify({ ...current, ...patch }));
  return { ...current, ...patch };
}
async function request(route) {
  const response = await fetch(`${base}${route}`, {
    signal: AbortSignal.timeout(20_000),
  });
  return {
    status: response.status,
    cache: response.headers.get("x-nextjs-cache"),
    html: await response.text(),
  };
}
async function eventually(check, message) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(message);
}
const recipePath = (slug) => `/recipes/${slug}`;

try {
  const manifest = JSON.parse(
    await readFile(path.join(root, ".next/prerender-manifest.json"), "utf8"),
  );
  assert.equal(manifest.routes[recipePath(freshSlug)], undefined);
  for (const artifact of artifacts) {
    await cp(path.join(root, ".next", artifact), path.join(scratch, artifact), {
      recursive: true,
    });
    captured.push(artifact);
  }
  await writeFile(
    stateFile,
    JSON.stringify({
      offsetMs: 0,
      version: 1,
      fail: false,
      published: [freshSlug],
      requests: {},
    }),
  );
  server = spawn(
    process.execPath,
    [
      "--import",
      fileURLToPath(
        new URL(
          "./fixtures/public-recipes-cache-provider.mjs",
          import.meta.url,
        ),
      ),
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env: { ...process.env, PUBLIC_RECIPE_CACHE_TEST_STATE: stateFile },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  await eventually(async () => {
    try {
      return (await fetch(`${base}/robots.txt`)).ok;
    } catch {
      return false;
    }
  }, "Production cache-test server did not start");

  const first = await request(recipePath(freshSlug));
  assert.equal(first.status, 200);
  assert.equal(first.cache, "MISS");
  assert.ok(first.html.includes("Cache revision 1"));
  assert.equal((await request(recipePath(freshSlug))).cache, "HIT");
  assert.equal(
    (await state()).requests[freshSlug],
    1,
    "Metadata and body should share one read",
  );

  await state({ offsetMs: 1_810_000, version: 2 });
  const unchanged = await request(recipePath(freshSlug));
  assert.equal(unchanged.cache, "HIT");
  assert.ok(
    unchanged.html.includes("Cache revision 1"),
    "Detail must stay cached beyond 30 minutes",
  );
  await eventually(async () => {
    const response = await request("/recipes");
    return (
      response.cache === "HIT" &&
      response.html.includes(`href="${recipePath(freshSlug)}"`)
    );
  }, "Directory did not refresh after 30 minutes");
  await eventually(async () => {
    return (await request("/sitemap.xml")).html.includes(
      `${recipePath(freshSlug)}</loc>`,
    );
  }, "Sitemap did not discover the new recipe");
  assert.equal(
    (await state()).requests.listing,
    1,
    "Directory and sitemap must share one listing read",
  );
  console.log(
    "PASS: unbuilt slug MISS → HIT; 30-minute listing refresh shared by directory/sitemap; recipe still cached.",
  );

  assert.equal((await request(recipePath(missingSlug))).status, 404);
  await state({ published: [freshSlug, missingSlug] });
  assert.equal(
    (await request(recipePath(missingSlug))).status,
    404,
    "Negative result should remain cached before expiry",
  );
  await state({ offsetMs: 90_000_000 });
  await eventually(async () => {
    const response = await request(recipePath(freshSlug));
    return (
      response.cache === "HIT" && response.html.includes("Cache revision 2")
    );
  }, "Recipe did not revalidate after 24 hours");
  await eventually(async () => {
    const response = await request(recipePath(missingSlug));
    return response.status === 200 && response.cache === "HIT";
  }, "Cached 404 did not recover after publication and expiry");
  assert.equal((await state()).requests[freshSlug], 2);
  assert.equal((await state()).requests[missingSlug], 2);
  console.log(
    "PASS: 24-hour recipe refresh and previously missing slug recovery, without rebuilding.",
  );

  await state({ offsetMs: 180_000_000, fail: true });
  const stale = await request(recipePath(freshSlug));
  assert.equal(stale.status, 200);
  assert.ok(stale.html.includes("Cache revision 2"));
  await eventually(
    async () => (await state()).requests[freshSlug] >= 3,
    "Failed background refresh was not attempted",
  );
  const retained = await request(recipePath(freshSlug));
  assert.equal(retained.status, 200);
  assert.ok(retained.html.includes("Cache revision 2"));
  assert.equal(
    (await request(recipePath("public-recipe-outage-fixture"))).status,
    500,
    "Backend outage must not become a 404",
  );
  console.log(
    "PASS: backend failures retain successful cached content and return errors for uncached requests.",
  );
} catch (error) {
  console.error(output.slice(-8000));
  throw error;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(timer);
  }
  for (const artifact of captured) {
    // Only restore successfully captured artifacts.
    try {
      await access(path.join(scratch, artifact));
    } catch {
      continue;
    }
    await rm(path.join(root, ".next", artifact), {
      recursive: true,
      force: true,
    });
    await cp(path.join(scratch, artifact), path.join(root, ".next", artifact), {
      recursive: true,
    });
  }
  await rm(scratch, { recursive: true, force: true });
}
