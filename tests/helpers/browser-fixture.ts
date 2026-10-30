import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { build, type InlineConfig } from "vite";

/** Keep the actual Tailwind output in layout-sensitive browser fixtures. */
export function productionStylesheet() {
  const root = path.resolve(".next/static/css");
  return readdirSync(root, { recursive: true })
    .filter((file) => String(file).endsWith(".css"))
    .map((file) => readFileSync(path.join(root, String(file)), "utf8"))
    .join("\n");
}

/** Bundle real components without writing a second app or hiding their mocks. */
export async function buildBrowserFixture({
  entry,
  name,
  define,
  resolve,
}: Pick<InlineConfig, "define" | "resolve"> & { entry: string; name: string }) {
  const result = await build({
    configFile: false,
    logLevel: "error",
    define,
    resolve,
    build: {
      write: false,
      minify: false,
      lib: { entry, name, formats: ["iife"] },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!("output" in bundle))
    throw new Error("Expected an in-memory browser bundle");
  return bundle.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
}
