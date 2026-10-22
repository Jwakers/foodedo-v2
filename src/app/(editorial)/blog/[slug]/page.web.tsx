import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  getBlogArticle,
  getPublishedPosts,
} from "@/features/blog/sanity.server";
import { localGuides } from "@/features/blog/guides";
import {
  articleMetadata,
  articleStructuredData,
  jsonLd,
} from "@/features/blog/metadata";
import {
  blogImageDimensions,
  blogImageUrl,
  formatBlogDate,
} from "@/features/blog/content";
import { ArticleBody } from "@/features/blog/article-body";
import { BlogInvitation } from "@/features/blog/editorial-shell";

type Props = { params: Promise<{ slug: string }> };
// Prebuild known articles, then cache newly published slugs on their first visit.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 60;

export async function generateStaticParams() {
  return [
    ...new Set(
      [...localGuides, ...(await getPublishedPosts())].map(({ slug }) => slug),
    ),
  ].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getBlogArticle((await params).slug);
  if (!article) notFound();
  return articleMetadata(article);
}

export default async function ArticlePage({ params }: Props) {
  const article = await getBlogArticle((await params).slug);
  if (!article) notFound();
  const image = blogImageUrl(article.mainImage, 1440);
  return (
    <main
      id="editorial-content"
      className="mx-auto flex w-full max-w-190 flex-col gap-8 px-page-inline pt-8 pb-10 sm:gap-12 sm:pt-12 sm:pb-16"
    >
      <article className="flex flex-col gap-8 sm:gap-12">
        <header className="flex flex-col gap-5">
          <Link
            href="/blog"
            className="inline-flex min-h-11 w-fit items-center gap-2 text-14 text-graphite underline-offset-4 hover:underline focus-visible:outline-cadmium"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Blog
          </Link>
          <h1 className="font-display text-34 leading-[39px] font-semibold tracking-heading sm:text-48 sm:leading-[52px]">
            {article.title}
          </h1>
          {article.publishedAt ? (
            <time
              dateTime={article.publishedAt}
              className="text-14 text-graphite"
            >
              {formatBlogDate(article.publishedAt)}
            </time>
          ) : null}
          {article.excerpt ? (
            <p className="text-18 leading-6.75 text-graphite sm:text-20 sm:leading-7.5">
              {article.excerpt}
            </p>
          ) : null}
        </header>
        {image && article.mainImage ? (
          <Image
            src={image}
            alt={article.mainImage.alt || ""}
            {...blogImageDimensions(article.mainImage)}
            sizes="(max-width: 760px) calc(100vw - 40px), 720px"
            preload
            className="h-auto w-full rounded-media"
          />
        ) : null}
        <ArticleBody body={article.body} title={article.title} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(articleStructuredData(article)),
          }}
        />
      </article>
      <BlogInvitation />
    </main>
  );
}
