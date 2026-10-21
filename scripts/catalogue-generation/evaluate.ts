/** Opt-in paid evaluation. Never writes to Convex or publishes content. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generationConfig } from "../../convex/lib/catalogueGeneration/config";
import {
  gatewayGenerationClient,
  type ModelEvent,
} from "../../convex/lib/catalogueGeneration/models";
import {
  generateProposal,
  photographyPrompt,
} from "../../convex/lib/catalogueGeneration/pipeline";
import { validateDownloadedRecipeImage } from "../../convex/lib/recipeImport/images";
import { prepareRecipeContent } from "../../src/lib/domain/recipes";
import type { AnalysisMeal } from "../../src/lib/domain/catalogue-generation";
export const evaluationBriefs = [
  "A budget lentil main with sufficient protein and vegetables, ready in 30 minutes.",
  "A crisp tofu dinner with a coherent sauce, rice and vegetables, ready in 35 minutes.",
  "A quick fish meal with explicit side-dish instructions and safe, clear doneness guidance.",
  "A chicken traybake with realistic cut sizes, oven timing and a complete satisfying plate.",
  "A minced-beef main with safe cooking and a flavour profile distinct from chilli or bolognese.",
  "A pork dinner with appropriate safe doneness, resting and balanced accompaniments.",
  "A slower lamb meal: include the real cooking and resting time, not a false weeknight promise.",
  "A vegetarian egg or cheese main with enough bulk and vegetables to feel like dinner.",
  "A cold chickpea lunch: honest zero cook time and a balanced, filling composition.",
  "A one-pan budget dinner with ordinary supermarket ingredients and little washing up.",
  "An approachable regional dish underrepresented in the supplied catalogue, without forced fusion.",
  "A pasta meal with a credible sauce-to-pasta ratio, explicit pasta cooking and economical portions.",
];
async function main() {
  if (!process.argv.includes("--live"))
    throw new Error(
      "Paid evaluation is opt-in. Run with --live and a reviewed V2 reference bundle using --references=PATH.",
    );
  if (!process.env.AI_GATEWAY_API_KEY)
    throw new Error("Set AI_GATEWAY_API_KEY in the shell environment.");
  const referencePath = process.argv
    .find((arg) => arg.startsWith("--references="))
    ?.slice("--references=".length);
  if (!referencePath)
    throw new Error(
      "Provide --references=PATH to a reviewed JSON array of V2 recipe contents (representative strong migrated V1 recipes).",
    );
  const raw: unknown = JSON.parse(await readFile(referencePath, "utf8"));
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 1000)
    throw new Error(
      "Reference bundle must contain 3–1000 reviewed V2 recipe contents.",
    );
  const meals: AnalysisMeal[] = raw.map((row, index) => ({
    key: `reference:${index}`,
    content: prepareRecipeContent(row),
  }));
  const output = path.resolve(
    ".catalogue-generation-evaluation",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(output, { recursive: true });
  const rubric = {
    cookability: null,
    flavourAndCoherence: null,
    portions: null,
    timings: null,
    clarity: null,
    meaningfulVariety: null,
    safetyIssues: [],
    approvedBy: null,
    cookThrough: { performed: false, notes: "" },
  };
  await writeFile(
    path.join(output, "reference-review.json"),
    JSON.stringify(
      meals.map((meal) => ({ recipe: meal.content, humanReview: rubric })),
      null,
      2,
    ),
  );
  const results: Array<{
    brief: string;
    status: string;
    usage: ModelEvent[];
    file?: string;
    failure?: string;
  }> = [];
  for (const [index, brief] of evaluationBriefs.entries()) {
    const usage: ModelEvent[] = [];
    const deadline = Date.now() + generationConfig.deadlineMs;
    const client = gatewayGenerationClient(
      generationConfig,
      deadline,
      async (event) => {
        usage.push(event);
      },
    );
    try {
      const result = await generateProposal(client, meals, undefined, brief);
      const file = `${String(index + 1).padStart(2, "0")}.json`;
      await writeFile(
        path.join(output, file),
        JSON.stringify(
          { brief, ...result, usage, humanReview: rubric },
          null,
          2,
        ),
      );
      // Optional image smoke test: one image for the first successful sample, never publication.
      if (
        process.argv.includes("--images") &&
        !results.some((r) => r.status === "succeeded")
      ) {
        const generated = await client.image(photographyPrompt(result.content));
        if (
          !validateDownloadedRecipeImage(generated.bytes, generated.mediaType)
        )
          throw new Error("Evaluation image failed validation.");
        const extension =
          generated.mediaType === "image/jpeg"
            ? "jpg"
            : generated.mediaType === "image/webp"
              ? "webp"
              : "png";
        await writeFile(
          path.join(output, `image-sample.${extension}`),
          generated.bytes,
        );
      }
      results.push({ brief, status: "succeeded", usage, file });
      meals.push({
        key: `evaluation:${index}`,
        content: result.content,
        tags: result.tags,
      });
    } catch (error) {
      results.push({
        brief,
        status: "failed",
        usage,
        failure: error instanceof Error ? error.message : "Unknown failure",
      });
    }
    console.info(
      `${index + 1}/${evaluationBriefs.length}: ${results.at(-1)?.status}`,
    );
  }
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        config: generationConfig,
        referenceTitles: meals
          .filter((m) => m.key.startsWith("reference:"))
          .map((m) => m.content.title),
        results,
        releaseGate:
          "Human review of all 12 samples and three representative cook-throughs required. Compare with reference recipes using the same rubric.",
      },
      null,
      2,
    ),
  );
  console.info(`Review artifacts: ${output}`);
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
