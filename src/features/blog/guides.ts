import type { BlogArticle } from "./content";
import guideContent from "./guides.json";

export const localGuides = guideContent.map((guide) => {
  const article: BlogArticle & { indexExcerpt: string } = {
    _id: `guide:${guide.slug}`,
    slug: guide.slug,
    title: guide.title,
    excerpt: guide.excerpt,
    seoDescription: guide.seoDescription,
    indexExcerpt: guide.indexExcerpt,
    body: guide.sections.flatMap((section, index) => [
      {
        _type: "block" as const,
        _key: `heading-${index}`,
        style: "h2",
        children: [{ _type: "span" as const, text: section.heading }],
      },
      {
        _type: "block" as const,
        _key: `body-${index}`,
        style: "normal",
        children: [{ _type: "span" as const, text: section.body }],
      },
      ...("link" in section && section.link
        ? [
            {
              _type: "block" as const,
              _key: `link-${index}`,
              style: "normal",
              markDefs: [
                {
                  _type: "link",
                  _key: `example-${index}`,
                  href: section.link.href,
                },
              ],
              children: [
                {
                  _type: "span" as const,
                  text: section.link.label,
                  marks: [`example-${index}`],
                },
              ],
            },
          ]
        : []),
    ]),
  };
  return article;
});

export function getLocalGuide(slug: string) {
  return localGuides.find((guide) => guide.slug === slug);
}
