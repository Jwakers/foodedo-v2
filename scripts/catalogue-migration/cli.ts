import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import type { RecipeContent } from "../../src/lib/domain/recipes";
import {
  allocateSlugs,
  CATALOGUE_MIGRATION_SCHEMA_VERSION,
  slugify,
  stableHash,
  transformRecipe,
  validateCandidateSet,
  type MigrationCandidate,
  type V1IngredientMetadata,
  type V1SystemRecipe,
} from "./transform";

const execFileAsync = promisify(execFile);
const REPO = resolve(import.meta.dirname, "../..");
const V1_REPO = resolve(
  process.env.FOODEDO_V1_PATH ?? join(REPO, "../foodedo"),
);
const ROOT = resolve(
  process.env.CATALOGUE_MIGRATION_DIR ?? join(REPO, ".catalogue-migration"),
);
const SOURCE_DIR = join(ROOT, "source");
const SOURCE_IMAGES = join(SOURCE_DIR, "images");
const CANDIDATES_PATH = join(SOURCE_DIR, "candidates.json");
const DECISIONS_PATH = join(ROOT, "decisions.json");
const REVIEW_PATH = join(ROOT, "review.html");
const PROMOTION_DIR = join(ROOT, "promotion");

export type Decision = {
  decision: "keep" | "remove" | null;
  approvals: {
    costBand: boolean | null;
    preheat?: boolean | null;
    timerCues?: boolean | null;
  };
  imageFile?: string | null;
  overrides: Record<string, unknown>;
};

export type DecisionsFile = {
  schemaVersion: 1;
  sourceSnapshotHash: string;
  reviewer: string | null;
  approvedAt: string | null;
  homeMealIds: string[];
  recipes: Record<string, Decision>;
};

export type CandidateFile = {
  schemaVersion: 1;
  extractedAt: string;
  expectedSourceCount: number;
  sourceSnapshotHash: string;
  sourceIds: string[];
  candidates: MigrationCandidate[];
};

type BundleMeal = {
  legacyV1RecipeId?: string;
  catalogueMealId: string;
  version: number;
  slug: string;
  position: number;
  content: RecipeContent;
  imageFile?: string;
  imageSha256?: string;
  createdAt: number;
  publishedAt?: number;
};

type PromotionManifest = {
  schemaVersion: 1;
  createdAt: string;
  sourceSnapshotHash: string;
  decisionsSha256: string;
  catalogueSemanticHash: string;
  count: number;
  files: Record<string, string>;
  meals: BundleMeal[];
};

function bundleSemanticHash(meals: BundleMeal[]) {
  return stableHash(
    meals.map((meal) => {
      const semantic = { ...meal } as Partial<BundleMeal>;
      delete semantic.imageFile;
      delete semantic.createdAt;
      delete semantic.publishedAt;
      return semantic;
    }),
  );
}

function usage(): never {
  throw new Error(
    [
      "Usage: pnpm catalogue:migrate <command>",
      "  extract                 Read V1 production system recipes and generate review artifacts",
      "  stage-dev               Back up, clear, and stage candidates in V2 development",
      "  stage-dev --fresh       Stage candidates into an already empty V2 development catalogue",
      "  apply-review            Validate decisions, apply cleanup, and publish development",
      "  export-promotion        Export the reviewed development catalogue bundle",
      "  import-promotion        Dry-run the bundle against V2 production",
      "  import-promotion --apply  Import and publish the bundle to empty V2 production",
      "  restore-dev             Restore the pre-clear development rollback bundle",
    ].join("\n"),
  );
}

async function runConvex(
  cwd: string,
  functionName: string,
  args: unknown,
  target: "dev" | "prod",
) {
  const command = [
    "exec",
    "convex",
    "run",
    functionName,
    JSON.stringify(args),
    ...(target === "prod" ? ["--prod"] : []),
  ];
  const { stdout, stderr } = await execFileAsync("pnpm", command, {
    cwd,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (stderr.trim()) process.stderr.write(stderr);
  return JSON.parse(stdout) as unknown;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function imageExtension(bytes: Uint8Array, contentType: string | null) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return ".jpg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return ".png";
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return ".webp";
  }
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  throw new Error("Only JPEG, PNG, and WebP catalogue images are supported.");
}

async function fetchImage(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Image fetch failed (${response.status}): ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error(`Image is empty: ${url}`);
  return {
    bytes,
    extension: imageExtension(bytes, response.headers.get("content-type")),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<R>,
) {
  const result = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      result[index] = await work(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

async function readV1SystemRecipes() {
  const recipes: V1SystemRecipe[] = [];
  let cursor: string | null = null;
  do {
    const result = (await runConvex(
      V1_REPO,
      "recipes:listSystemRecipesPaginated",
      { paginationOpts: { numItems: 10, cursor } },
      "prod",
    )) as { page: V1SystemRecipe[]; continueCursor: string; isDone: boolean };
    recipes.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor !== null);
  return recipes;
}

async function readIngredientMetadata(recipes: V1SystemRecipe[]) {
  const ids = [
    ...new Set(
      recipes.flatMap((recipe) =>
        (recipe.ingredients ?? []).flatMap((line) =>
          line.ingredientId ? [line.ingredientId] : [],
        ),
      ),
    ),
  ];
  const metadata = new Map<string, V1IngredientMetadata>();
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const result = (await runConvex(
      V1_REPO,
      "ingredients:getByIds",
      { ids: batch },
      "prod",
    )) as Record<string, V1IngredientMetadata>;
    for (const [id, row] of Object.entries(result)) metadata.set(id, row);
  }
  return metadata;
}

async function readSeedRecipeKeys() {
  const source = await readFile(
    join(V1_REPO, "convex/lib/systemRecipes.ts"),
    "utf8",
  );
  return new Set(
    [...source.matchAll(/^    title: "([^"]+)",$/gm)].map((match) =>
      slugify(match[1]!),
    ),
  );
}

async function extract() {
  await rm(SOURCE_DIR, { recursive: true, force: true });
  await mkdir(SOURCE_IMAGES, { recursive: true });
  const recipes = await readV1SystemRecipes();
  if (recipes.length !== 113) {
    throw new Error(
      `V1 snapshot drifted: expected 113 system recipes, received ${recipes.length}. Review the delta before continuing.`,
    );
  }
  if (recipes.some((recipe) => recipe.source !== "system")) {
    throw new Error("The V1 query returned a non-system recipe.");
  }
  const ingredientMetadata = await readIngredientMetadata(recipes);
  const seedRecipeKeys = await readSeedRecipeKeys();
  if (seedRecipeKeys.size !== 90) {
    throw new Error(
      `V1 seed drifted: expected 90 recipes, found ${seedRecipeKeys.size}.`,
    );
  }
  const slugs = allocateSlugs(recipes);
  const candidates = await mapConcurrent(recipes, 5, async (recipe) => {
    const slug = slugs.get(recipe._id)!;
    const image = recipe.image ? await fetchImage(recipe.image) : undefined;
    const imageFile = image ? `images/${slug}${image.extension}` : undefined;
    if (image && imageFile)
      await writeFile(join(SOURCE_DIR, imageFile), image.bytes);
    return transformRecipe({
      recipe,
      slug,
      seedRecipeKeys,
      ingredientMetadata,
      ...(imageFile === undefined ? {} : { imageFile }),
      ...(image === undefined ? {} : { imageSha256: image.sha256 }),
    });
  });
  candidates.sort((a, b) => a.meal.title.localeCompare(b.meal.title));
  const validationErrors = validateCandidateSet(candidates);
  if (validationErrors.length > 0) throw new Error(validationErrors.join("\n"));
  const extractedAt = new Date().toISOString();
  const sourceSnapshotHash = stableHash(
    candidates.map(({ legacyV1RecipeId, imageSha256, meal }) => ({
      legacyV1RecipeId,
      imageSha256,
      meal,
    })),
  );
  const candidateFile: CandidateFile = {
    schemaVersion: CATALOGUE_MIGRATION_SCHEMA_VERSION,
    extractedAt,
    expectedSourceCount: 113,
    sourceSnapshotHash,
    sourceIds: candidates.map((candidate) => candidate.legacyV1RecipeId).sort(),
    candidates,
  };
  await writeJson(join(SOURCE_DIR, "system-recipes.json"), recipes);
  await writeJson(
    join(SOURCE_DIR, "ingredient-metadata.json"),
    Object.fromEntries(ingredientMetadata),
  );
  await writeJson(CANDIDATES_PATH, candidateFile);

  const decisions: DecisionsFile = {
    schemaVersion: 1,
    sourceSnapshotHash,
    reviewer: null,
    approvedAt: null,
    homeMealIds: [],
    recipes: Object.fromEntries(
      candidates.map((candidate) => [
        candidate.legacyV1RecipeId,
        {
          decision: candidate.flags.length === 0 ? "keep" : null,
          approvals: {
            costBand: null,
            ...(candidate.inferred.preheat ? { preheat: null } : {}),
            ...(candidate.inferred.timerCues ? { timerCues: null } : {}),
          },
          ...(candidate.imageFile ? {} : { imageFile: null }),
          overrides: {},
        } satisfies Decision,
      ]),
    ),
  };
  await writeJson(DECISIONS_PATH, decisions);
  await writeFile(REVIEW_PATH, renderReview(candidateFile, decisions));
  console.log(
    `Extracted ${candidates.length} system recipes (${candidates.filter((candidate) => candidate.flags.includes("absent_from_v1_seed")).length} absent from seed).`,
  );
  console.log(`Snapshot: ${sourceSnapshotHash}`);
  console.log(`Review: ${REVIEW_PATH}`);
  console.log(`Decisions: ${DECISIONS_PATH}`);
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderReview(candidateFile: CandidateFile, decisions: DecisionsFile) {
  const cards = candidateFile.candidates
    .map((candidate) => {
      const decision = decisions.recipes[candidate.legacyV1RecipeId]!;
      const inference = Object.entries(candidate.inferred)
        .map(
          ([name, evidence]) =>
            `<li><strong>${escapeHtml(name)}</strong>: ${escapeHtml(JSON.stringify(evidence.value))}<small>${evidence.evidence.map(escapeHtml).join("<br>")}</small></li>`,
        )
        .join("");
      return `<article class="${candidate.flags.length ? "flagged" : ""}">
        ${candidate.imageFile ? `<img src="source/${escapeHtml(candidate.imageFile)}" alt="">` : '<div class="missing-image">Replacement image required</div>'}
        <div><h2>${escapeHtml(candidate.meal.title)}</h2>
        <p><code>${escapeHtml(candidate.legacyV1RecipeId)}</code> → <code>${escapeHtml(candidate.meal.id)}</code></p>
        <p><b>Decision template:</b> ${escapeHtml(decision.decision ?? "REQUIRED")}</p>
        <p class="flags">${candidate.flags.map(escapeHtml).join(" · ") || "No source flags"}</p>
        <p>${escapeHtml(candidate.meal.description ?? "")}</p>
        <ul>${inference}</ul>
        <details><summary>${candidate.meal.ingredients.length} ingredients · ${candidate.meal.steps.length} steps</summary><pre>${escapeHtml(JSON.stringify(candidate.meal, null, 2))}</pre></details>
        </div></article>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Foodedo catalogue review</title>
  <style>body{font:15px system-ui;margin:0;background:#f5f2e9;color:#211f1a}header{position:sticky;top:0;background:#211f1a;color:white;padding:18px 5vw;z-index:2}main{max-width:1100px;margin:auto;padding:24px}article{display:grid;grid-template-columns:220px 1fr;gap:24px;background:white;margin:18px 0;padding:18px;border-radius:18px;box-shadow:0 2px 12px #0001}article.flagged{outline:3px solid #c66b32}img,.missing-image{width:220px;height:165px;object-fit:cover;border-radius:12px}.missing-image{display:grid;place-items:center;background:#f5d6c5;color:#8a2c0d;text-align:center;font-weight:700}h2{margin-top:0}.flags{color:#a13d18;font-weight:700}small{display:block;color:#655;margin:4px 0 10px}pre{white-space:pre-wrap;max-height:420px;overflow:auto;background:#f4f4f4;padding:12px}@media(max-width:700px){article{grid-template-columns:1fr}img,.missing-image{width:100%;height:220px}}</style>
  <header><b>Foodedo catalogue review</b> · ${candidateFile.candidates.length} candidates · snapshot <code>${candidateFile.sourceSnapshotHash.slice(0, 12)}</code><br>Edit <code>${escapeHtml(DECISIONS_PATH)}</code>; this page is evidence-only.</header><main>${cards}</main></html>`;
}

function splitContent(row: Record<string, unknown>): RecipeContent {
  return {
    title: row.title as string,
    ...(row.description === undefined
      ? {}
      : { description: row.description as string }),
    ingredients: row.ingredients as RecipeContent["ingredients"],
    steps: row.steps as RecipeContent["steps"],
    ...(row.servings === undefined ? {} : { servings: row.servings as number }),
    ...(row.prepMinutes === undefined
      ? {}
      : { prepMinutes: row.prepMinutes as number }),
    ...(row.cookMinutes === undefined
      ? {}
      : { cookMinutes: row.cookMinutes as number }),
    proteinCategory: row.proteinCategory as RecipeContent["proteinCategory"],
    ...(row.costBand === undefined
      ? {}
      : { costBand: row.costBand as RecipeContent["costBand"] }),
    ...(row.preheat === undefined
      ? {}
      : { preheat: row.preheat as RecipeContent["preheat"] }),
    ...(row.notes === undefined
      ? {}
      : { notes: row.notes as RecipeContent["notes"] }),
    ...(row.servingScaling === undefined
      ? {}
      : {
          servingScaling: row.servingScaling as RecipeContent["servingScaling"],
        }),
  };
}

async function exportDeploymentBundle(
  outputDirectory: string,
  target: "dev" | "prod",
  sourceSnapshotHash: string,
  decisionsSha256: string,
) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(join(outputDirectory, "images"), { recursive: true });
  const rows = (await runConvex(
    REPO,
    "catalogueMigration:exportCatalogue",
    {},
    target,
  )) as Array<Record<string, unknown> & { imageUrl: string | null }>;
  rows.sort((a, b) => Number(a.position) - Number(b.position));
  const meals: BundleMeal[] = [];
  for (const row of rows) {
    if (!row.imageUrl)
      throw new Error(`Catalogue row ${row.catalogueMealId} has no image URL.`);
    const image = await fetchImage(row.imageUrl);
    const imageFile = `images/${row.slug}${image.extension}`;
    await writeFile(join(outputDirectory, imageFile), image.bytes);
    meals.push({
      catalogueMealId: row.catalogueMealId as string,
      version: row.version as number,
      slug: row.slug as string,
      position: row.position as number,
      content: splitContent(row),
      imageFile,
      imageSha256: image.sha256,
      createdAt: row.createdAt as number,
      ...(row.publishedAt === undefined
        ? {}
        : { publishedAt: row.publishedAt as number }),
    });
  }
  const files: Record<string, string> = {};
  for (const meal of meals) {
    if (!meal.imageFile || !meal.imageSha256) {
      throw new Error(`Exported meal ${meal.catalogueMealId} has no image.`);
    }
    files[meal.imageFile] = meal.imageSha256;
  }
  const catalogueSemanticHash = bundleSemanticHash(meals);
  const manifest: PromotionManifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceSnapshotHash,
    decisionsSha256,
    catalogueSemanticHash,
    count: meals.length,
    files,
    meals,
  };
  await writeJson(join(outputDirectory, "manifest.json"), manifest);
  await writeFile(
    join(outputDirectory, "catalogue.jsonl"),
    `${meals.map((meal) => JSON.stringify(meal)).join("\n")}\n`,
  );
  files["catalogue.jsonl"] = createHash("sha256")
    .update(await readFile(join(outputDirectory, "catalogue.jsonl")))
    .digest("hex");
  await writeJson(join(outputDirectory, "manifest.json"), manifest);
  return manifest;
}

async function uploadImages(
  meals: BundleMeal[],
  baseDirectory: string,
  target: "dev" | "prod",
) {
  const storageIds = new Map<string, string>();
  const withImages = meals.filter(
    (meal): meal is BundleMeal & { imageFile: string; imageSha256: string } =>
      meal.imageFile !== undefined && meal.imageSha256 !== undefined,
  );
  for (let index = 0; index < withImages.length; index += 10) {
    const batch = withImages.slice(index, index + 10);
    const urls = (await runConvex(
      REPO,
      "catalogueMigration:generateUploadUrls",
      { count: batch.length },
      target,
    )) as string[];
    await Promise.all(
      batch.map(async (meal, offset) => {
        const path = join(baseDirectory, meal.imageFile);
        const bytes = await readFile(path);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== meal.imageSha256)
          throw new Error(`Image hash mismatch: ${meal.imageFile}`);
        const extension = extname(path).toLowerCase();
        const contentType =
          extension === ".png"
            ? "image/png"
            : extension === ".webp"
              ? "image/webp"
              : "image/jpeg";
        const response = await fetch(urls[offset]!, {
          method: "POST",
          headers: { "content-type": contentType },
          body: bytes,
        });
        if (!response.ok)
          throw new Error(`Image upload failed: ${meal.imageFile}`);
        const result = (await response.json()) as { storageId: string };
        storageIds.set(meal.catalogueMealId, result.storageId);
      }),
    );
  }
  return storageIds;
}

async function stageMeals(
  meals: BundleMeal[],
  baseDirectory: string,
  target: "dev" | "prod",
) {
  const storageIds = await uploadImages(meals, baseDirectory, target);
  for (let index = 0; index < meals.length; index += 10) {
    const batch = meals.slice(index, index + 10);
    await runConvex(
      REPO,
      "catalogueMigration:stageBatch",
      {
        meals: batch.map((meal) => ({
          catalogueMealId: meal.catalogueMealId,
          version: meal.version,
          slug: meal.slug,
          position: meal.position,
          content: meal.content,
          imageStorageId: storageIds.get(meal.catalogueMealId),
          createdAt: meal.createdAt,
        })),
      },
      target,
    );
  }
}

function candidateMeals(candidateFile: CandidateFile): BundleMeal[] {
  const createdAt = Date.parse(candidateFile.extractedAt);
  return candidateFile.candidates.map((candidate, position) => {
    const { id, slug, version, ...content } = candidate.meal;
    return {
      legacyV1RecipeId: candidate.legacyV1RecipeId,
      catalogueMealId: id,
      version,
      slug,
      position,
      content,
      ...(candidate.imageFile === undefined
        ? {}
        : { imageFile: candidate.imageFile }),
      ...(candidate.imageSha256 === undefined
        ? {}
        : { imageSha256: candidate.imageSha256 }),
      createdAt,
    };
  });
}

async function stageDev(fresh = false) {
  const candidateFile = await readJson<CandidateFile>(CANDIDATES_PATH);
  const inspect = (await runConvex(
    REPO,
    "catalogueMigration:inspect",
    {},
    "dev",
  )) as {
    count: number;
  };
  const expectedCount = fresh ? 0 : 30;
  if (inspect.count !== expectedCount) {
    throw new Error(
      `Development preflight expected ${expectedCount} catalogue rows, found ${inspect.count}.`,
    );
  }
  const rollbackDir = join(ROOT, "rollback-dev");
  if (!fresh) {
    await exportDeploymentBundle(
      rollbackDir,
      "dev",
      "pre-migration",
      "not-reviewed",
    );
    await runConvex(
      REPO,
      "catalogueMigration:clearCatalogue",
      { expectedCount: 30 },
      "dev",
    );
  }
  await stageMeals(candidateMeals(candidateFile), SOURCE_DIR, "dev");
  const audit = (await runConvex(
    REPO,
    "catalogueMigration:auditStaging",
    {},
    "dev",
  )) as {
    stagingCount: number;
    publishedCount: number;
    errors: string[];
  };
  const expectedMissingImages = new Set(
    candidateFile.candidates
      .filter((candidate) => candidate.imageFile === undefined)
      .map((candidate) => `no image:${candidate.meal.id}`),
  );
  const unexpectedErrors = audit.errors.filter(
    (error) => !expectedMissingImages.has(error),
  );
  if (
    audit.stagingCount !== 113 ||
    audit.publishedCount !== 0 ||
    unexpectedErrors.length
  ) {
    throw new Error(`Staging audit failed: ${JSON.stringify(audit)}`);
  }
  console.log(
    "V2 development now contains 113 staging recipes and no published recipes.",
  );
  if (!fresh) console.log(`Rollback bundle: ${rollbackDir}`);
  console.log(
    `Complete the review decisions at ${DECISIONS_PATH} before apply-review.`,
  );
}

function mergeOverrides(
  content: RecipeContent,
  overrides: Record<string, unknown>,
) {
  const merged = { ...content } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged as RecipeContent;
}

export function validateAndResolveReview(
  candidateFile: CandidateFile,
  decisions: DecisionsFile,
) {
  if (decisions.sourceSnapshotHash !== candidateFile.sourceSnapshotHash) {
    throw new Error("Decisions were created for a different source snapshot.");
  }
  if (!decisions.reviewer?.trim() || !decisions.approvedAt) {
    throw new Error("Reviewer and approvedAt are required.");
  }
  if (Number.isNaN(Date.parse(decisions.approvedAt)))
    throw new Error("approvedAt is invalid.");
  const kept: Array<{ candidate: MigrationCandidate; content: RecipeContent }> =
    [];
  const removed: MigrationCandidate[] = [];
  for (const candidate of candidateFile.candidates) {
    const decision = decisions.recipes[candidate.legacyV1RecipeId];
    if (!decision || decision.decision === null) {
      throw new Error(
        `A keep/remove decision is required for ${candidate.meal.title}.`,
      );
    }
    if (decision.decision === "remove") {
      removed.push(candidate);
      continue;
    }
    if (!candidate.imageFile && !decision.imageFile) {
      throw new Error(
        `${candidate.meal.title} requires a replacement image or removal.`,
      );
    }
    for (const key of Object.keys(candidate.inferred) as Array<
      keyof typeof candidate.inferred
    >) {
      if (
        decision.approvals[key] === null ||
        decision.approvals[key] === undefined
      ) {
        throw new Error(`${candidate.meal.title} requires ${key} approval.`);
      }
    }
    const candidateContent = { ...candidate.meal } as Partial<
      MigrationCandidate["meal"]
    >;
    delete candidateContent.id;
    delete candidateContent.slug;
    delete candidateContent.version;
    let content = mergeOverrides(
      candidateContent as RecipeContent,
      decision.overrides,
    );
    if (!decision.approvals.costBand && !("costBand" in decision.overrides)) {
      const withoutCost = { ...content };
      delete withoutCost.costBand;
      content = withoutCost;
    }
    if (
      candidate.inferred.preheat &&
      !decision.approvals.preheat &&
      !("preheat" in decision.overrides)
    ) {
      const withoutPreheat = { ...content };
      delete withoutPreheat.preheat;
      content = withoutPreheat;
    }
    if (
      candidate.inferred.timerCues &&
      !decision.approvals.timerCues &&
      !("steps" in decision.overrides)
    ) {
      content = {
        ...content,
        steps: content.steps.map((step) => {
          const withoutTimer = { ...step };
          delete withoutTimer.timerCues;
          return withoutTimer;
        }),
      };
    }
    kept.push({ candidate, content });
  }
  if (
    decisions.homeMealIds.length !== 6 ||
    new Set(decisions.homeMealIds).size !== 6
  ) {
    throw new Error("Exactly six unique Home meal IDs are required.");
  }
  const keptIds = new Set(kept.map(({ candidate }) => candidate.meal.id));
  for (const id of decisions.homeMealIds) {
    if (!keptIds.has(id))
      throw new Error(`Home meal ${id} is not an accepted recipe.`);
  }
  const proteinOrder = [
    "chicken",
    "beef",
    "pork",
    "lamb",
    "fish",
    "meat-free",
    "other",
  ];
  const remainder = kept
    .filter(
      ({ candidate }) => !decisions.homeMealIds.includes(candidate.meal.id),
    )
    .sort((a, b) => {
      const protein =
        proteinOrder.indexOf(a.content.proteinCategory) -
        proteinOrder.indexOf(b.content.proteinCategory);
      return protein || a.content.title.localeCompare(b.content.title);
    })
    .map(({ candidate }) => candidate.meal.id);
  return {
    kept,
    removed,
    orderedMealIds: [...decisions.homeMealIds, ...remainder],
  };
}

async function applyReview() {
  const candidateFile = await readJson<CandidateFile>(CANDIDATES_PATH);
  const decisions = await readJson<DecisionsFile>(DECISIONS_PATH);
  const resolved = validateAndResolveReview(candidateFile, decisions);
  for (const { candidate } of resolved.kept) {
    const replacementPath =
      decisions.recipes[candidate.legacyV1RecipeId]?.imageFile;
    if (!replacementPath) continue;
    if (isAbsolute(replacementPath)) {
      throw new Error(
        `Replacement image path must be relative: ${replacementPath}`,
      );
    }
    const absolutePath = resolve(ROOT, replacementPath);
    if (!absolutePath.startsWith(`${ROOT}${sep}`)) {
      throw new Error(
        `Replacement image escapes the migration directory: ${replacementPath}`,
      );
    }
    const bytes = await readFile(absolutePath);
    const extension = extname(absolutePath).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      throw new Error(`Unsupported replacement image: ${replacementPath}`);
    }
    const [uploadUrl] = (await runConvex(
      REPO,
      "catalogueMigration:generateUploadUrls",
      { count: 1 },
      "dev",
    )) as string[];
    const response = await fetch(uploadUrl!, {
      method: "POST",
      headers: {
        "content-type":
          extension === ".png"
            ? "image/png"
            : extension === ".webp"
              ? "image/webp"
              : "image/jpeg",
      },
      body: bytes,
    });
    if (!response.ok)
      throw new Error(`Replacement upload failed: ${replacementPath}`);
    const { storageId } = (await response.json()) as { storageId: string };
    await runConvex(
      REPO,
      "catalogueMigration:attachStagingImage",
      {
        catalogueMealId: candidate.meal.id,
        version: 1,
        imageStorageId: storageId,
      },
      "dev",
    );
  }
  const entries = [
    ...resolved.kept.map(({ candidate, content }) => ({
      kind: "keep" as const,
      candidate,
      content,
    })),
    ...resolved.removed.map((candidate) => ({
      kind: "remove" as const,
      candidate,
    })),
  ];
  for (let index = 0; index < entries.length; index += 10) {
    const batch = entries.slice(index, index + 10);
    await runConvex(
      REPO,
      "catalogueMigration:replaceStagingBatch",
      {
        keep: batch.flatMap((entry) =>
          entry.kind === "keep"
            ? [
                {
                  catalogueMealId: entry.candidate.meal.id,
                  version: 1,
                  slug: entry.candidate.meal.slug,
                  content: entry.content,
                },
              ]
            : [],
        ),
        remove: batch.flatMap((entry) =>
          entry.kind === "remove"
            ? [{ catalogueMealId: entry.candidate.meal.id, version: 1 }]
            : [],
        ),
      },
      "dev",
    );
  }
  const audit = (await runConvex(
    REPO,
    "catalogueMigration:auditStaging",
    {},
    "dev",
  )) as {
    stagingCount: number;
    publishedCount: number;
    errors: string[];
  };
  if (
    audit.stagingCount !== resolved.kept.length ||
    audit.publishedCount !== 0 ||
    audit.errors.length
  ) {
    throw new Error(`Reviewed staging audit failed: ${JSON.stringify(audit)}`);
  }
  await runConvex(
    REPO,
    "catalogueMigration:publishStaging",
    {
      orderedMealIds: resolved.orderedMealIds,
      publishedAt: Date.parse(decisions.approvedAt!),
    },
    "dev",
  );
  console.log(
    `Published ${resolved.kept.length} reviewed development recipes.`,
  );
}

async function exportPromotion() {
  const candidateFile = await readJson<CandidateFile>(CANDIDATES_PATH);
  const decisionsBytes = await readFile(DECISIONS_PATH);
  const decisionsSha256 = createHash("sha256")
    .update(decisionsBytes)
    .digest("hex");
  const manifest = await exportDeploymentBundle(
    PROMOTION_DIR,
    "dev",
    candidateFile.sourceSnapshotHash,
    decisionsSha256,
  );
  console.log(`Exported ${manifest.count} recipes to ${PROMOTION_DIR}.`);
  console.log(`Catalogue semantic hash: ${manifest.catalogueSemanticHash}`);
}

async function verifyBundle(directory: string) {
  const manifest = await readJson<PromotionManifest>(
    join(directory, "manifest.json"),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.count !== manifest.meals.length
  ) {
    throw new Error("Promotion manifest shape or count is invalid.");
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const positions = new Set<number>();
  for (const meal of manifest.meals) {
    if (ids.has(meal.catalogueMealId))
      throw new Error(`Duplicate ID ${meal.catalogueMealId}.`);
    if (slugs.has(meal.slug)) throw new Error(`Duplicate slug ${meal.slug}.`);
    if (positions.has(meal.position))
      throw new Error(`Duplicate position ${meal.position}.`);
    ids.add(meal.catalogueMealId);
    slugs.add(meal.slug);
    positions.add(meal.position);
    if (!meal.imageFile || !meal.imageSha256) {
      throw new Error(
        `Published bundle meal ${meal.catalogueMealId} has no image.`,
      );
    }
    const bytes = await readFile(join(directory, meal.imageFile));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== meal.imageSha256 || manifest.files[meal.imageFile] !== hash) {
      throw new Error(`Checksum mismatch for ${meal.imageFile}.`);
    }
  }
  const semanticHash = bundleSemanticHash(manifest.meals);
  if (semanticHash !== manifest.catalogueSemanticHash) {
    throw new Error("Catalogue semantic hash does not match the manifest.");
  }
  return manifest;
}

async function importPromotion(apply: boolean) {
  const manifest = await verifyBundle(PROMOTION_DIR);
  const inspect = (await runConvex(
    REPO,
    "catalogueMigration:inspect",
    {},
    "prod",
  )) as {
    count: number;
  };
  if (inspect.count !== 0) {
    throw new Error(
      `Production catalogue must be empty; found ${inspect.count} rows.`,
    );
  }
  console.log(
    `Dry-run passed for ${manifest.count} recipes (${manifest.catalogueSemanticHash}).`,
  );
  if (!apply) return;
  await stageMeals(manifest.meals, PROMOTION_DIR, "prod");
  const audit = (await runConvex(
    REPO,
    "catalogueMigration:auditStaging",
    {},
    "prod",
  )) as {
    stagingCount: number;
    publishedCount: number;
    errors: string[];
  };
  if (
    audit.stagingCount !== manifest.count ||
    audit.publishedCount !== 0 ||
    audit.errors.length
  ) {
    throw new Error(
      `Production staging audit failed: ${JSON.stringify(audit)}`,
    );
  }
  await runConvex(
    REPO,
    "catalogueMigration:publishStaging",
    {
      orderedMealIds: [...manifest.meals]
        .sort((a, b) => a.position - b.position)
        .map((meal) => meal.catalogueMealId),
      publishedAt: Date.now(),
    },
    "prod",
  );
  const productionDir = join(ROOT, "production-verification");
  const production = await exportDeploymentBundle(
    productionDir,
    "prod",
    manifest.sourceSnapshotHash,
    manifest.decisionsSha256,
  );
  if (production.catalogueSemanticHash !== manifest.catalogueSemanticHash) {
    throw new Error(
      "Production catalogue hash differs from the promotion bundle.",
    );
  }
  console.log(
    `Production import verified: ${production.catalogueSemanticHash}`,
  );
}

async function restoreDev() {
  const rollbackDir = join(ROOT, "rollback-dev");
  const manifest = await verifyBundle(rollbackDir);
  const inspect = (await runConvex(
    REPO,
    "catalogueMigration:inspect",
    {},
    "dev",
  )) as {
    count: number;
  };
  await runConvex(
    REPO,
    "catalogueMigration:clearCatalogue",
    { expectedCount: inspect.count },
    "dev",
  );
  await stageMeals(manifest.meals, rollbackDir, "dev");
  await runConvex(
    REPO,
    "catalogueMigration:publishStaging",
    {
      orderedMealIds: [...manifest.meals]
        .sort((a, b) => a.position - b.position)
        .map((meal) => meal.catalogueMealId),
      publishedAt: Date.now(),
    },
    "dev",
  );
  console.log(`Restored ${manifest.count} development catalogue rows.`);
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (!command) usage();
  await mkdir(ROOT, { recursive: true });
  if (command === "extract") return await extract();
  if (command === "stage-dev") return await stageDev(flags.includes("--fresh"));
  if (command === "apply-review") return await applyReview();
  if (command === "export-promotion") return await exportPromotion();
  if (command === "import-promotion")
    return await importPromotion(flags.includes("--apply"));
  if (command === "restore-dev") return await restoreDev();
  usage();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
