// Evaluation-only experiment. Nothing in the application imports this module.
import { z } from "zod";
import {
  importedRecipeSchema,
  importIssueSchema,
  type RecipeImportModelClient,
  type StructuredModelTask,
} from "../convex/lib/recipeImport/models";
import { ImportFailure } from "../convex/lib/recipeImport/contracts";

const ingredientsSchema = z.object({
  result: z.union([
    z.object({
      status: z.literal("recipe"),
      recipe: importedRecipeSchema.pick({ ingredients: true, notes: true }),
      issues: z.array(importIssueSchema).max(30),
    }),
    z.object({ status: z.literal("no_recipe") }),
  ]),
});
const methodSchema = z.object({
  result: z.union([
    z.object({
      status: z.literal("recipe"),
      recipe: importedRecipeSchema.omit({ ingredients: true }),
      issues: z.array(importIssueSchema).max(30),
    }),
    z.object({ status: z.literal("no_recipe") }),
  ]),
});

/** Split the first call only; the normal correction and acceptance still run. */
export function parallelBenchmarkClient(
  client: RecipeImportModelClient,
): RecipeImportModelClient {
  let calls = 0;
  async function bounded<T>(task: StructuredModelTask<T>): Promise<T> {
    if (++calls > 3)
      throw new ImportFailure(
        "invalid_model_output",
        "Parallel benchmark exhausted its three-call budget.",
      );
    return client.generate(task);
  }
  return {
    async generate(task) {
      if (task.role !== "normalize") return bounded(task);
      const [ingredients, method] = await Promise.all([
        bounded({
          ...task,
          role: "benchmark_ingredients",
          schema: ingredientsSchema,
          system: `${task.system}\nEXPERIMENT: extract ingredients and their recipe notes only. Select the primary recipe; preserve component groups and quantities.`,
        }),
        bounded({
          ...task,
          role: "benchmark_method",
          schema: methodSchema,
          system: `${task.system}\nEXPERIMENT: extract metadata, the primary method and method notes only. Select the primary recipe; preserve actions, durations and temperatures.`,
        }),
      ]);
      if (
        ingredients.result.status === "no_recipe" &&
        method.result.status === "no_recipe"
      )
        return task.schema.parse({ result: { status: "no_recipe" } });
      if (
        ingredients.result.status !== "recipe" ||
        method.result.status !== "recipe"
      )
        throw new ImportFailure(
          "invalid_model_output",
          "Parallel source selections disagree.",
        );
      // Separate calls may assign the same note ID to different notes. Re-key
      // each section explicitly before merging; correction may then consolidate.
      const ingredientNotes = new Map(
        ingredients.result.recipe.notes.map((note, index) => [
          note.id,
          `note-${index + 1}`,
        ]),
      );
      const offset = ingredients.result.recipe.notes.length;
      const methodNotes = new Map(
        method.result.recipe.notes.map((note, index) => [
          note.id,
          `note-${offset + index + 1}`,
        ]),
      );
      const notes = [
        ...ingredients.result.recipe.notes.map((note) => ({
          ...note,
          id: ingredientNotes.get(note.id)!,
        })),
        ...method.result.recipe.notes.map((note) => ({
          ...note,
          id: methodNotes.get(note.id)!,
        })),
      ];
      return task.schema.parse({
        result: {
          status: "recipe",
          recipe: {
            ...method.result.recipe,
            ingredients: ingredients.result.recipe.ingredients.map((line) => ({
              ...line,
              noteRefs: line.noteRefs.map(
                (id) => ingredientNotes.get(id) ?? id,
              ),
            })),
            steps: method.result.recipe.steps.map((line) => ({
              ...line,
              noteRefs: line.noteRefs.map((id) => methodNotes.get(id) ?? id),
            })),
            notes,
          },
          issues: [...ingredients.result.issues, ...method.result.issues]
            .sort(
              (left, right) => Number(right.blocking) - Number(left.blocking),
            )
            .slice(0, 30),
        },
      });
    },
  };
}
