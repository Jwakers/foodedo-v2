// @vitest-environment node
import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { blogArticleSchema } from "../../src/features/blog/content";
import { ArticleBody } from "../../src/features/blog/article-body";
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
