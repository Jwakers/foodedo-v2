import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function assertExampleSource(expected, actual) {
  assert.ok(actual, `${expected.slug}: published recipe is missing`);
  for (const key of Object.keys(expected)) {
    assert.deepEqual(
      actual[key],
      expected[key],
      `${expected.slug}: ${key} changed; review the worked example before publishing`,
    );
  }
}

async function audit() {
  const snapshot = JSON.parse(
    await readFile(
      new URL(
        "../src/features/public-pages/shopping-list-example.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const recipe of snapshot.recipes) {
    const response = await fetch(`${snapshot.catalogueUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "catalogue:getCurrentMealBySlug",
        args: { slug: recipe.slug },
        format: "json",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    assert.ok(
      response.ok,
      `${recipe.slug}: source request failed (${response.status})`,
    );
    const result = await response.json();
    assert.equal(
      result.status,
      "success",
      `${recipe.slug}: source query failed`,
    );
    assertExampleSource(recipe, result.value);
    console.log(
      `${recipe.slug}: reviewed revision ${recipe.version} still matches`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await audit();
}
