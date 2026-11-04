// @vitest-environment node
import { expect, it } from "vitest";
import { z } from "zod";
import {
  correctionOutputSchema,
  importedRecipeSchema,
  importOutputSchema,
} from "./models";

it.each([
  ["normalization and recovery", importOutputSchema],
  ["correction", correctionOutputSchema],
] as const)(
  "keeps every %s response object compatible with strict structured outputs",
  (_, schema) => {
    function check(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(check);
        return;
      }
      const node = value as Record<string, unknown>;
      if (node.type === "object" && node.properties) {
        expect(node.required).toEqual(Object.keys(node.properties));
        expect(node.additionalProperties).toBe(false);
      }
      Object.values(node).forEach(check);
    }
    check(z.toJSONSchema(schema));
  },
);

it("represents an unknown minimum yield with null instead of an optional response field", () => {
  expect(
    importedRecipeSchema.shape.minimumServings.safeParse(null).success,
  ).toBe(true);
  expect(
    importedRecipeSchema.shape.minimumServings.safeParse(undefined).success,
  ).toBe(false);
});
