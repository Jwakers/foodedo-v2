// @vitest-environment node
import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { blogArticleSchema } from "../../src/features/blog/content";
import { ArticleBody } from "../../src/features/blog/article-body";
import { BlogImage } from "../../src/features/blog/blog-image";
import { blogImageUrl } from "../../src/features/blog/content";
import { load } from "cheerio";
const image = {
  asset: {
    _ref: "image-e77baadcd5efcd2e5c7d26a0b6abbf071bc87499-1408x768-png",
  },
};

test("renders headings, nested lists, safe links and actual nested CMS image objects", () => {
  const body = blogArticleSchema.parse({
    _id: "fixture",
    title: "An article",
    slug: "an-article",
    body: [
      {
        _type: "block",
        style: "h1",
        children: [{ _type: "span", text: "An older heading" }],
      },
      {
        _type: "block",
        listItem: "bullet",
        level: 1,
        children: [{ _type: "span", text: "Choose dinners" }],
      },
      {
        _type: "block",
        listItem: "bullet",
        level: 2,
        children: [{ _type: "span", text: "Start with favourites" }],
      },
      {
        _type: "block",
        listItem: "number",
        level: 1,
        children: [{ _type: "span", text: "Check the pantry" }],
      },
      {
        _type: "block",
        markDefs: [
          { _type: "link", _key: "plan", href: "/dashboard/meal-plan" },
        ],
        children: [{ _type: "span", text: "Your week", marks: ["plan"] }],
      },
      {
        _type: "block",
        markDefs: [{ _type: "link", _key: "bad", href: "javascript:alert(1)" }],
        children: [{ _type: "span", text: "Unsafe link", marks: ["bad"] }],
      },
      {
        _type: "pteImage",
        image,
        alt: "A bowl of dinner",
        caption: "Start with something familiar.",
      },
      {
        _type: "image",
        _key: "publisher-image",
        ...image,
        alt: "Dinner planning steps",
        caption: "Review your shopping list.",
        crop: { top: 0.1, bottom: 0.1, left: 0, right: 0 },
        hotspot: { x: 0.5, y: 0.5, width: 1, height: 1 },
      },
      { _type: "image", alt: "An unfinished image" },
      { _type: "image", asset: { _ref: "missing" }, alt: "A broken image" },
    ],
  }).body;
  const html = renderToStaticMarkup(
    <ImageConfigContext.Provider
      value={{
        ...imageConfigDefault,
        remotePatterns: [{ protocol: "https", hostname: "cdn.sanity.io" }],
      }}
    >
      <ArticleBody body={body} />
    </ImageConfigContext.Provider>,
  );
  expect(html).toContain("<h2");
  expect(html).not.toContain("<h1");
  expect(html).toContain("<ul");
  expect(html).toContain("<ol");
  expect(html).toContain('href="/week"');
  expect(html).not.toContain("javascript:");
  expect(html).toContain('alt="A bowl of dinner"');
  expect(html).toContain("<figcaption");
  expect(html).toContain("Start with something familiar.");
  expect(html).toContain("cdn.sanity.io");
  expect(html).not.toContain("/_next/image");
  expect(html).toContain('alt="Dinner planning steps"');
  expect(html).toContain("Review your shopping list.");
  expect(html).toContain('height="614"');
  expect(html).not.toContain("An unfinished image");
  expect(html).not.toContain("A broken image");
});

test("responsive blog images resize directly at Sanity while preserving editorial crops", () => {
  const src = blogImageUrl(
    {
      ...image,
      crop: { top: 0.1, bottom: 0.1, left: 0.1, right: 0 },
      hotspot: { x: 0.6, y: 0.5, width: 0.2, height: 0.2 },
    },
    800,
    500,
  )!;
  const original = new URL(src);
  const html = renderToStaticMarkup(
    <BlogImage src={src} alt="Dinner" width={800} height={500} sizes="400px" />,
  );
  const $ = load(html);
  const candidates = $("img").attr("srcset")!.split(", ");
  expect(candidates.length).toBeGreaterThan(1);
  expect(html).not.toContain("/_next/image");
  expect($("img").attr("loading")).toBe("lazy");
  for (const candidate of candidates) {
    const [source, descriptor] = candidate.split(" ");
    const url = new URL(source);
    const width = Number.parseInt(descriptor, 10);
    expect(url.hostname).toBe("cdn.sanity.io");
    expect(url.searchParams.get("w")).toBe(String(width));
    expect(url.searchParams.get("h")).toBe(
      String(Math.round((width * 500) / 800)),
    );
    expect(url.searchParams.get("rect")).toBe(
      original.searchParams.get("rect"),
    );
    expect(url.searchParams.get("fit")).toBe("crop");
    expect(url.searchParams.get("auto")).toBe("format");
    expect(url.searchParams.get("q")).toBe("75");
  }
});

test("article images retain their crop without acquiring a fixed output height", () => {
  const src = blogImageUrl(image, 1440)!;
  const html = renderToStaticMarkup(
    <BlogImage
      src={src}
      alt="Dinner"
      width={1408}
      height={768}
      sizes="720px"
      preload
    />,
  );
  const $ = load(html);
  expect($("link[rel=preload]").attr("imagesrcset")).toContain("cdn.sanity.io");
  expect(html).not.toContain("/_next/image");
  for (const candidate of $("img").attr("srcset")!.split(", ")) {
    const url = new URL(candidate.split(" ")[0]);
    expect(url.searchParams.has("h")).toBe(false);
    expect(url.searchParams.get("fit")).toBe("max");
  }
});

test("omits only a repeated opening title, retaining distinct authored headings", () => {
  const body = blogArticleSchema.parse({
    _id: "dinner",
    title: "Dinner ideas",
    slug: "dinner-ideas",
    body: [
      {
        _type: "block",
        style: "h1",
        children: [{ _type: "span", text: "Dinner ideas" }],
      },
      {
        _type: "block",
        style: "normal",
        children: [{ _type: "span", text: "Start with favourites." }],
      },
      {
        _type: "block",
        style: "h1",
        children: [{ _type: "span", text: "Choose your week" }],
      },
    ],
  }).body;
  const html = renderToStaticMarkup(
    <ArticleBody body={body} title="Dinner ideas" />,
  );
  expect(html).not.toContain("Dinner ideas");
  expect(html).toContain("Start with favourites.");
  expect(html).toContain("Choose your week");
  expect((html.match(/<h2[ >]/g) ?? []).length).toBe(1);
});

test("keeps same-article anchors and guest link parameters in the rendered HTML", () => {
  const body = blogArticleSchema.parse({
    _id: "links",
    title: "Links",
    slug: "links",
    body: [
      {
        _type: "block",
        markDefs: [
          { _type: "link", _key: "section", href: "#ingredients" },
          { _type: "link", _key: "try", href: "/sign-up?source=guide#start" },
        ],
        children: [
          { _type: "span", text: "Ingredients", marks: ["section"] },
          { _type: "span", text: "Try it", marks: ["try"] },
        ],
      },
    ],
  }).body;
  const html = renderToStaticMarkup(<ArticleBody body={body} />);
  expect(html).toContain('href="#ingredients"');
  expect(html).toContain('href="/?try=1&amp;source=guide#start"');
});
