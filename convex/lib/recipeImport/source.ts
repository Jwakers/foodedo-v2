"use node";

import * as cheerio from "cheerio";
import { RECIPE_IMPORT_LIMITS, ImportFailure } from "./contracts";
import { safeFetch, readBoundedBytes, discardResponse } from "./network";
import { selectSourceImages } from "./sourceImages";

export type RecipeEvidenceBlock = {
  id: string;
  kind: "structured" | "page" | "text";
  text: string;
  path?: string;
};
export type RecipeSourceCandidate = {
  blocks: RecipeEvidenceBlock[];
  truncated: boolean;
  omittedBlocks?: Array<{ kind: RecipeEvidenceBlock["kind"]; path?: string }>;
  sourceText: string;
  extractor: "html" | "text";
  sourceUrl?: string;
  sourceName?: string;
  sourceAuthor?: string;
  sourceImageUrls?: string[];
};
type SourceInput = Omit<RecipeEvidenceBlock, "id"> & { priority?: number };
// Keep recipe evidence, not linked publisher/site graphs or unrelated entities.
const recipeEvidenceFields = [
  "image",
  "name",
  "description",
  "author",
  "recipeYield",
  "prepTime",
  "cookTime",
  "totalTime",
  "recipeIngredient",
  "recipeInstructions",
  "recipeNotes",
  "notes",
  "recipeCategory",
  "recipeCuisine",
  "keywords",
  "tool",
  "supply",
];
function cleanText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
/** Budget whole blocks including their envelope; never cut through an ingredient or instruction. */
function packageSource(
  inputs: SourceInput[],
  extractor: RecipeSourceCandidate["extractor"],
): RecipeSourceCandidate {
  const selected: Array<{
    index: number;
    size: number;
    block: Omit<RecipeEvidenceBlock, "id">;
  }> = [];
  const seen = new Set<string>();
  let used = 200;
  let truncated = false;
  const omittedBlocks: NonNullable<RecipeSourceCandidate["omittedBlocks"]> = [];
  const omit = (input: SourceInput) => {
    truncated = true;
    if (omittedBlocks.length >= 24) return;
    const diagnostic = {
      kind: input.kind,
      ...(input.path ? { path: input.path.slice(0, 160) } : {}),
    };
    omittedBlocks.push(diagnostic);
    used += JSON.stringify(diagnostic).length + 1;
  };
  // Rank only for budget selection, then restore authored order. Small sources
  // keep exactly the same evidence order; long articles cannot starve recipe data.
  const ranked = inputs
    .map((input, index) => ({ input, index }))
    .sort(
      (a, b) =>
        (b.input.priority ?? 0) - (a.input.priority ?? 0) || a.index - b.index,
    );
  for (const { input, index } of ranked) {
    const text = cleanText(input.text);
    if (!text) continue;
    const key = input.kind + ":" + (input.path ?? "") + ":" + text;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = {
      kind: input.kind,
      ...(input.path ? { path: input.path } : {}),
      text,
    };
    const size =
      JSON.stringify({ ...block, id: `B${inputs.length}` }).length + 2;
    if (used + size > RECIPE_IMPORT_LIMITS.modelSourceCharacters) {
      omit(input);
      continue;
    }
    selected.push({ index, size, block });
    used += size;
  }
  // Omission diagnostics themselves consume context. Evict only the lowest
  // priority trailing selections if those diagnostics took us over the bound.
  while (used > RECIPE_IMPORT_LIMITS.modelSourceCharacters && selected.length) {
    const dropped = selected.pop()!;
    used -= dropped.size;
    omit(dropped.block);
  }
  const blocks = selected
    .sort((a, b) => a.index - b.index)
    .map(({ block }, index) => ({ ...block, id: `B${index + 1}` }));
  return {
    blocks,
    truncated,
    omittedBlocks,
    sourceText: blocks.map((block) => block.text).join("\n"),
    extractor,
  };
}
export function serializeRecipeEvidence(candidate: RecipeSourceCandidate) {
  return JSON.stringify({
    sourceType: candidate.extractor === "text" ? "pasted_text" : "web_page",
    truncated: candidate.truncated,
    omittedBlocks: candidate.omittedBlocks ?? [],
    blocks: candidate.blocks,
  });
}
export function extractTextCandidate(text: string): RecipeSourceCandidate {
  return packageSource(
    text.split(/\r?\n/).map((text, index) => ({
      kind: "text" as const,
      path: `line[${index + 1}]`,
      text,
    })),
    "text",
  );
}
function findRecipes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(findRecipes);
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  return [
    ...(type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))
      ? [object]
      : []),
    ...Object.values(object).flatMap(findRecipes),
  ];
}
function structuredBlocks(value: unknown, path: string): SourceInput[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      structuredBlocks(item, `${path}[${index}]`),
    );
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, item]) =>
      [
        "aggregateRating",
        "review",
        "nutrition",
        "image",
        "video",
        "url",
        "@context",
        "@id",
        "@type",
      ].includes(key)
        ? []
        : structuredBlocks(item, `${path}.${key}`),
    );
  return typeof value === "string" || typeof value === "number"
    ? [{ kind: "structured", path, text: String(value) }]
    : [];
}
function resolvedRecipes(root: unknown) {
  const byId = new Map<string, Record<string, unknown>>();
  const index = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(index);
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (typeof object["@id"] === "string" && Object.keys(object).length > 1)
        byId.set(object["@id"], object);
      Object.values(object).forEach(index);
    }
  };
  index(root);
  let expanded = 0;
  let truncated = false;
  const resolve = (value: unknown, depth = 0): unknown => {
    if (depth > 15 || ++expanded > 10_000) {
      truncated = true;
      return undefined;
    }
    if (Array.isArray(value))
      return value.map((item) => resolve(item, depth + 1));
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      const referenced =
        typeof object["@id"] === "string" && Object.keys(object).length === 1
          ? byId.get(object["@id"])
          : undefined;
      return Object.fromEntries(
        Object.entries(referenced ?? object).map(([key, item]) => [
          key,
          resolve(item, depth + 1),
        ]),
      );
    }
    return value;
  };
  return {
    recipes: findRecipes(root)
      .map(
        (recipe) =>
          resolve(
            Object.fromEntries(
              Object.entries(recipe).filter(([key]) =>
                recipeEvidenceFields.includes(key),
              ),
            ),
          ) as Record<string, unknown>,
      )
      .filter((recipe): recipe is Record<string, unknown> => Boolean(recipe)),
    truncated,
  };
}
export function extractHtmlCandidate(
  html: string,
  finalUrl: string,
): RecipeSourceCandidate {
  const $ = cheerio.load(html);
  const recipes: Record<string, unknown>[] = [];
  let graphTruncated = false;
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const resolved = resolvedRecipes(JSON.parse($(element).text()));
      recipes.push(...resolved.recipes);
      graphTruncated ||= resolved.truncated;
    } catch {
      /* Malformed JSON-LD cannot prevent reading visible content. */
    }
  });
  const sourceImageUrls = selectSourceImages(
    $,
    recipes.flatMap((recipe) => recipe.image ?? []),
    $('meta[property="og:image"]').attr("content") ??
      $('meta[name="twitter:image"]').attr("content"),
    finalUrl,
  );
  const structured = recipes
    .flatMap((recipe, index) =>
      structuredBlocks(recipe, `recipe[${index + 1}]`),
    )
    .map((block) => ({
      ...block,
      priority:
        /^recipe\[\d+\]\.(?:name|recipeIngredient|recipeInstructions|recipeYield|prepTime|cookTime|totalTime|recipeNotes|notes)(?:\[|\.|$)/.test(
          block.path ?? "",
        )
          ? 2
          : 1,
    }));
  const inputs: SourceInput[] = [];
  const title = $("h1").first().text() || $("title").text();
  if (title)
    inputs.unshift({
      kind: "page",
      path: "page.title",
      text: title,
      priority: 3,
    });
  $(
    "script, style, noscript, nav, header, footer, form, button, iframe, [role=navigation], .comments, #comments, .comment-list",
  ).remove();
  const card = $(
    '[itemtype*="schema.org/Recipe"], [class*="recipe-container"], [class*="recipe-card"], #recipe',
  );
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  const nodeIds = new WeakMap<object, number>();
  let nextNodeId = 1;
  const read = (region: ReturnType<typeof $>, priority = 0) => {
    let recipeHeadingLevel: number | undefined;
    region.find("br").replaceWith("\n");
    const emit = (node: ReturnType<typeof $>, text: string) => {
      const element = node.get(0);
      if (!element) return;
      if (!nodeIds.has(element)) nodeIds.set(element, nextNodeId++);
      if (node.is("h1,h2,h3,h4,h5,h6")) {
        const level = Number(node.prop("tagName")?.slice(1));
        if (
          /^(?:ingredients|what you(?:’|')ll need|method|instructions|directions|preparation|recipe notes)\b/i.test(
            text.trim(),
          )
        )
          recipeHeadingLevel = level;
        else if (
          recipeHeadingLevel !== undefined &&
          level <= recipeHeadingLevel
        )
          recipeHeadingLevel = undefined;
      }
      inputs.push({
        kind: "page",
        priority: priority || (recipeHeadingLevel !== undefined ? 3 : 0),
        path: [
          node.prop("tagName"),
          node.attr("class"),
          node.parent().attr("class"),
          `node-${nodeIds.get(element)}`,
        ]
          .filter(Boolean)
          .join(" "),
        text,
      });
    };
    const walk = (node: ReturnType<typeof $>) => {
      if (node.is("tr")) {
        emit(
          node,
          node
            .children("th,td")
            .map((_, cell) => $(cell).text())
            .get()
            .join(" | "),
        );
        return;
      }
      if (node.is("li") && node.children("ul,ol").length) {
        const own = node.clone();
        own.children("ul,ol").remove();
        emit(node, own.text());
        node.children("ul,ol").each((_, list) => walk($(list)));
        return;
      }
      // Keep authored paragraphs/list items whole, even with nested spans/lists.
      if (node.is("h1,h2,h3,h4,h5,h6,p,li,dt,dd")) {
        emit(node, node.text());
        return;
      }
      let inline = "";
      const flush = () => {
        emit(node, inline);
        inline = "";
      };
      node.contents().each((_, child) => {
        if (child.type === "text") inline += child.data;
        else if (child.type === "tag") {
          const element = $(child);
          if (
            element.is(
              'h1,h2,h3,h4,h5,h6,p,li,dt,dd,div,section,article,main,body,ul,ol,table,thead,tbody,tfoot,tr,span[style*="block"]',
            )
          ) {
            flush();
            walk(element);
          } else inline += element.text();
        }
      });
      flush();
    };
    walk(region);
  };
  // Recipe cards are readable page content, without the surrounding blog/chrome.
  // Keep authored order; packageSource prioritizes core evidence if it must truncate.
  // Node identities deduplicate overlap, not repeated authored rows. Empty jump
  // anchors cannot suppress the article; AI still selects the relevant recipe.
  card.each((_, element) => read($(element), 3));
  read(root);
  inputs.push(...structured);
  const candidate = packageSource(inputs, "html");
  candidate.truncated ||= graphTruncated;
  const canonical = $('link[rel="canonical"]').attr("href");
  let sourceUrl = finalUrl;
  if (canonical) {
    try {
      const url = new URL(canonical, finalUrl);
      if (
        url.hostname.replace(/^www\./, "") ===
          new URL(finalUrl).hostname.replace(/^www\./, "") &&
        ["https:", "http:"].includes(url.protocol)
      )
        sourceUrl = url.toString();
    } catch {
      /* use fetched URL */
    }
  }
  const structuredAuthor = recipes.length === 1 ? recipes[0].author : undefined;
  const author =
    $('meta[name="author"]').attr("content") ??
    (typeof structuredAuthor === "string"
      ? structuredAuthor
      : structuredAuthor &&
          typeof structuredAuthor === "object" &&
          "name" in structuredAuthor &&
          typeof structuredAuthor.name === "string"
        ? structuredAuthor.name
        : undefined);
  return {
    ...candidate,
    sourceUrl,
    sourceName:
      $('meta[property="og:site_name"]').attr("content") ??
      new URL(finalUrl).hostname,
    ...(author ? { sourceAuthor: author } : {}),
    ...(sourceImageUrls ? { sourceImageUrls } : {}),
  };
}
export async function extractUrlCandidate(
  rawUrl: string,
): Promise<RecipeSourceCandidate> {
  const response = await safeFetch(
    rawUrl,
    RECIPE_IMPORT_LIMITS.htmlBytes,
    "html",
  );
  if (
    !/text\/html|application\/xhtml\+xml/.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    await discardResponse(response);
    throw new ImportFailure(
      "unsupported_content",
      "Recipe source was not HTML.",
    );
  }
  const bytes = await readBoundedBytes(
    response,
    RECIPE_IMPORT_LIMITS.htmlBytes,
  );
  return extractHtmlCandidate(
    new TextDecoder().decode(bytes),
    response.url || rawUrl,
  );
}
