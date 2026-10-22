import type { Metadata } from "next";
import { siteUrl } from "@/lib/seo/site-url";
import { articleDescription, blogImageUrl, type BlogSummary } from "./content";

export function articleMetadata(article: BlogSummary): Metadata {
  const title = `${article.title} | Foodedo`;
  const description = articleDescription(article);
  const url = siteUrl(`/blog/${article.slug}`);
  const image = blogImageUrl(article.mainImage, 1200, 630);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Foodedo",
      locale: "en_GB",
      type: "article",
      publishedTime: article.publishedAt || undefined,
      modifiedTime: article._updatedAt || undefined,
      images: image
        ? [
            {
              url: image,
              width: 1200,
              height: 630,
              alt: article.mainImage?.alt || article.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function articleStructuredData(article: BlogSummary) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: articleDescription(article),
    mainEntityOfPage: siteUrl(`/blog/${article.slug}`),
    image: blogImageUrl(article.mainImage, 1200, 630),
    datePublished: article.publishedAt || undefined,
    dateModified: article._updatedAt || undefined,
    publisher: { "@type": "Organization", name: "Foodedo", url: siteUrl() },
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
