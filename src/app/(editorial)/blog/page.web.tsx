import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { localGuides } from "@/features/blog/guides";
import { getPublishedPosts } from "@/features/blog/sanity.server";
import { blogImageUrl, formatBlogDate } from "@/features/blog/content";
import { BlogInvitation } from "@/features/blog/editorial-shell";
import { siteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";
export const revalidate = 60;

const description =
  "Practical ideas for easier dinners, calmer meal planning and one less thing on your mind.";
export const metadata: Metadata = {
  title: "Blog | Foodedo",
  description,
  alternates: { canonical: siteUrl("/blog") },
  openGraph: {
    title: "Blog | Foodedo",
    description,
    type: "website",
    url: siteUrl("/blog"),
    siteName: "Foodedo",
    locale: "en_GB",
  },
  twitter: { card: "summary", title: "Blog | Foodedo", description },
};

export default async function BlogPage() {
  const posts = (await getPublishedPosts()).filter(
    (post) => !localGuides.some((guide) => guide.slug === post.slug),
  );
  return (
    <main
      id="editorial-content"
      className="mx-auto flex w-full max-w-360 flex-col gap-8 px-page-inline py-8 sm:gap-12 lg:px-24 lg:py-16"
    >
      <section aria-labelledby="blog-heading" className="flex flex-col gap-4">
        <p className="text-13 font-semibold tracking-eyebrow text-graphite">
          THE FOODEDO BLOG
        </p>
        <h1
          id="blog-heading"
          className="max-w-205 font-display text-42 leading-[46px] font-semibold tracking-display sm:text-56 sm:leading-[60px]"
        >
          A little less thinking.
          <br />A little more cooking.
        </h1>
        <p className="max-w-140 text-16 leading-6 text-graphite sm:text-18 sm:leading-7">
          {description}
        </p>
      </section>
      <section aria-labelledby="guides-heading">
        <h2
          id="guides-heading"
          className="pb-5 font-display text-26 leading-8 font-semibold tracking-title"
        >
          Start with a useful guide
        </h2>
        <ul className="grid sm:grid-cols-2 sm:gap-x-12">
          {localGuides.map((guide) => (
            <li key={guide.slug} className="border-t border-border">
              <Link
                href={`/blog/${guide.slug}`}
                className="group flex h-full items-start justify-between gap-4 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <h3 className="text-18 leading-6.25 font-semibold tracking-card underline-offset-4 group-hover:underline sm:text-20 sm:leading-7">
                    {guide.title}
                  </h3>
                  <p className="text-14 leading-5.25 text-graphite">
                    {guide.indexExcerpt}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="mt-1 size-5 shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="articles-heading"
        className="border-t border-border pt-8"
      >
        <h2
          id="articles-heading"
          className="font-display text-26 leading-8 font-semibold tracking-title"
        >
          From the blog
        </h2>
        {posts.length ? (
          <ul className="mt-6 flex flex-col gap-8 sm:gap-10">
            {posts.map((post) => {
              const image = blogImageUrl(post.mainImage, 800, 500);
              return (
                <li key={post._id}>
                  <Link
                    href={`/blog/${post.slug}`}
                    prefetch={false}
                    className="group flex flex-col gap-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium sm:flex-row sm:items-center"
                  >
                    {image ? (
                      <Image
                        src={image}
                        alt={post.mainImage?.alt || ""}
                        width={800}
                        height={500}
                        sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) 35vw, 400px"
                        className="aspect-[8/5] w-full rounded-media object-cover sm:w-[35%] sm:max-w-100"
                      />
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      {post.publishedAt ? (
                        <time
                          dateTime={post.publishedAt}
                          className="text-13 leading-4.5 text-graphite"
                        >
                          {formatBlogDate(post.publishedAt)}
                        </time>
                      ) : null}
                      <h3 className="font-display text-30 leading-9 font-semibold tracking-title underline-offset-4 group-hover:underline">
                        {post.title}
                      </h3>
                      {post.excerpt ? (
                        <p className="text-16 leading-6 text-graphite">
                          {post.excerpt}
                        </p>
                      ) : null}
                      <span className="inline-flex min-h-11 items-center gap-3 text-14">
                        Read article
                        <ArrowRight className="size-5" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 text-16 text-graphite">
            More articles are on the way. Start with a guide above.
          </p>
        )}
      </section>
      <BlogInvitation />
    </main>
  );
}
