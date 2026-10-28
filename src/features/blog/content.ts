import { createImageUrlBuilder } from "@sanity/image-url";
import { z } from "zod";

export const blogRevalidateSeconds = 60;

export function sanityConfig() {
  return {
    projectId: process.env.SANITY_PROJECT_ID?.trim() || "i8ook8b1",
    dataset: process.env.SANITY_DATASET?.trim() || "production",
  };
}

export const blogImageSchema = z.object({
  asset: z.object({ _ref: z.string() }).optional(),
  alt: z.string().nullish(),
  crop: z
    .object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number(),
    })
    .optional(),
  hotspot: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

const spanSchema = z.object({
  _type: z.literal("span"),
  _key: z.string().optional(),
  text: z.string(),
  marks: z.array(z.string()).optional(),
});
const blockSchema = z.object({
  _type: z.literal("block"),
  _key: z.string().optional(),
  children: z.array(spanSchema),
  style: z.string().optional(),
  listItem: z.string().optional(),
  level: z.number().optional(),
  markDefs: z
    .array(
      z.object({ _type: z.string(), _key: z.string() }).catchall(z.unknown()),
    )
    .optional(),
});
export const inlineImageSchema = z.object({
  _type: z.literal("pteImage"),
  _key: z.string().optional(),
  image: blogImageSchema.nullish(),
  alt: z.string().nullish(),
  caption: z.string().nullish(),
});
// External publishers also write native Sanity images directly into the body.
export const bodyImageSchema = blogImageSchema.extend({
  _type: z.literal("image"),
  _key: z.string().optional(),
  caption: z.string().nullish(),
});
export const blogBodySchema = z.array(
  z.union([blockSchema, inlineImageSchema, bodyImageSchema]),
);

const dateSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid article date")
  .nullish();
export const blogSummarySchema = z.object({
  _id: z.string(),
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  publishedAt: dateSchema,
  _updatedAt: dateSchema,
  excerpt: z.string().nullish(),
  mainImage: blogImageSchema.nullish(),
  seoDescription: z.string().optional(),
});
export const blogArticleSchema = blogSummarySchema.extend({
  body: blogBodySchema.nullish(),
});
export type BlogSummary = z.infer<typeof blogSummarySchema>;
export type BlogArticle = z.infer<typeof blogArticleSchema>;
export type BlogImage = z.infer<typeof blogImageSchema>;

export function blogImageDimensions(image: BlogImage) {
  const match = /-(\d+)x(\d+)-[a-z]+$/.exec(image.asset?._ref || "");
  if (!match) return { width: 1440, height: 960 };
  const width = Number(match[1]);
  const height = Number(match[2]);
  const crop = image.crop;
  // Match Sanity's pixel rounding so Next/Image reserves the actual URL's ratio.
  return {
    width: Math.max(
      1,
      Math.round(
        width -
          (crop?.right || 0) * width -
          Math.round((crop?.left || 0) * width),
      ),
    ),
    height: Math.max(
      1,
      Math.round(
        height -
          (crop?.bottom || 0) * height -
          Math.round((crop?.top || 0) * height),
      ),
    ),
  };
}

export function blogImageUrl(
  image: BlogImage | null | undefined,
  width: number,
  height?: number,
): string | undefined {
  if (!image?.asset?._ref) return undefined;
  try {
    let builder = createImageUrlBuilder(sanityConfig())
      .image(image)
      .width(width)
      .auto("format")
      .fit("max");
    if (height) builder = builder.height(height).fit("crop");
    return builder.url();
  } catch {
    // A missing/corrupt optional image should not hide an otherwise usable article.
    return undefined;
  }
}

export function articleDescription(article: BlogSummary): string {
  return (
    article.seoDescription ||
    article.excerpt?.trim() ||
    `Read ${article.title} on the Foodedo blog.`
  );
}

export function formatBlogDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

const legacyDestinations: Record<string, string> = {
  "/discover": "/recipes",
  "/dashboard/meal-plan": "/week",
  "/dashboard/shopping-list": "/shop",
  "/dashboard/my-recipes": "/recipes",
  "/dashboard/import-recipe": "/recipes/import",
  "/dashboard/households": "/household",
  "/dashboard/chalkboard": "/shop",
  "/sign-in": "/?try=1",
  "/sign-up": "/?try=1",
  "/pricing": "/faq",
  "/beta": "/",
  "/how-to-build-shopping-list-from-meal-plan":
    "/blog/how-to-build-shopping-list-from-meal-plan",
};

/** Resolve V1 links at read time; never modify the CMS or accept executable URLs. */
export function resolveBlogLink(href: unknown): string | undefined {
  if (typeof href !== "string" || !href.trim()) return undefined;
  const value = href.trim();
  // Fragment/query-only links belong to the current article, not the site root.
  if (value.startsWith("#") || value.startsWith("?")) return value;
  try {
    const url = new URL(value, "https://foodedo.com");
    if (!["http:", "https:", "mailto:"].includes(url.protocol))
      return undefined;
    if (url.protocol === "mailto:") return url.href;
    if (["foodedo.com", "www.foodedo.com"].includes(url.hostname)) {
      const path = url.pathname.replace(/\/$/, "") || "/";
      const recipeMatch = /^\/discover\/recipe\/([a-z0-9-]+)$/.exec(path);
      if (
        path === "/discover/recipe/chicken-tacos-with-salsa" ||
        path === "/recipes/chicken-tacos-with-salsa"
      )
        return `/recipes/chicken-tacos-with-avocado-salsa${url.search}${url.hash}`;
      if (recipeMatch)
        return `/recipes/${recipeMatch[1]}${url.search}${url.hash}`;
      const destination = legacyDestinations[path];
      if (destination) {
        const mapped = new URL(destination, "https://foodedo.com");
        for (const [key, value] of url.searchParams)
          if (!mapped.searchParams.has(key))
            mapped.searchParams.append(key, value);
        return `${mapped.pathname}${mapped.search}${url.hash}`;
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.href;
  } catch {
    return undefined;
  }
}
