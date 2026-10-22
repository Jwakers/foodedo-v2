// Local production-cache verification only; never imported by application code.
import { readFileSync, writeFileSync } from "node:fs";

const stateFile = process.env.PUBLIC_RECIPE_CACHE_TEST_STATE;
if (!stateFile) throw new Error("Missing cache-test state");
const readState = () => JSON.parse(readFileSync(stateFile, "utf8"));
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + readState().offsetMs;
// Next's incremental cache uses the monotonic clock plus its epoch, while the
// filesystem cache uses Date.now(). Advance both epochs together.
const realTimeOrigin = performance.timeOrigin;
Object.defineProperty(performance, "timeOrigin", {
  get: () => realTimeOrigin + readState().offsetMs,
});
const originalFetch = globalThis.fetch;

globalThis.fetch = async function (input, init) {
  const url = new URL(
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url,
  );
  if (url.hostname.endsWith(".api.sanity.io")) {
    return Response.json({ result: [] });
  }
  if (url.pathname === "/api/query" && init?.body) {
    const query = JSON.parse(init.body);
    if (
      ["catalogue:getCurrent", "catalogue:getCurrentMealBySlug"].includes(
        query.path,
      )
    ) {
      const state = readState();
      const slug = query.args[0].slug;
      const key = slug ?? "listing";
      state.requests[key] = (state.requests[key] ?? 0) + 1;
      writeFileSync(stateFile, JSON.stringify(state));
      if (state.fail)
        return new Response("Fixture backend unavailable", { status: 503 });
      const recipe = (slug) => ({
        id: `cache-fixture-${slug}`,
        slug,
        version: state.version,
        position: 0,
        title: "Cache verification dinner",
        description: `Cache revision ${state.version}`,
        proteinCategory: "meat-free",
        servings: 2,
        prepMinutes: 0,
        cookMinutes: 5,
        imageSrc: "/images/recipes/fish-tacos.jpg",
        ingredients: [
          {
            id: "beans",
            name: "beans",
            quantity: "1",
            unit: "tin",
            shoppingCategory: "pantry",
          },
        ],
        steps: [{ id: "cook", text: "Warm the beans." }],
      });
      const value =
        query.path === "catalogue:getCurrent"
          ? { meals: state.published.map(recipe) }
          : state.published.includes(slug)
            ? recipe(slug)
            : null;
      return Response.json({ status: "success", value, logLines: [] });
    }
  }
  return originalFetch.call(this, input, init);
};
