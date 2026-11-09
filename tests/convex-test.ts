import { convexTest as createTest } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/test";

export function convexTest<Schema extends GenericSchema>(
  schema: SchemaDefinition<Schema, boolean>,
  modules: Record<string, () => Promise<unknown>>,
) {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  return t;
}
