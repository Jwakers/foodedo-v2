import type { Metadata } from "next";
import Link from "next/link";
import { BlogInvitation } from "@/features/blog/editorial-shell";
import { siteUrl } from "@/lib/seo/site-url";
import pages from "./pages.json";

function getPage(path: string) {
  const page = pages.find((page) => page.path === path);
  if (!page) throw new Error(`Missing public page definition: ${path}`);
  return page;
}

export function publicPageMetadata(path: string): Metadata {
  const page = getPage(path);
  return {
    title: `${page.title} | Foodedo`,
    description: page.description,
    alternates: { canonical: siteUrl(path) },
    openGraph: {
      title: page.title,
      description: page.description,
      url: siteUrl(path),
      type: "website",
      siteName: "Foodedo",
    },
    twitter: {
      card: "summary",
      title: page.title,
      description: page.description,
    },
  };
}

export function PublicPage({ path }: { path: string }) {
  const page = getPage(path);
  return (
    <main
      id="editorial-content"
      className="mx-auto flex w-full max-w-190 flex-col gap-10 px-page-inline pt-8 pb-12 sm:gap-14 sm:pt-14 sm:pb-16"
    >
      <article className="flex flex-col gap-10">
        <header className="flex flex-col gap-5">
          <p className="text-12 font-semibold tracking-widest text-graphite uppercase">
            {page.kind === "guide"
              ? "A more useful week"
              : page.kind === "legal"
                ? "Service information · draft for review"
                : "Foodedo help"}
          </p>
          <h1 className="font-display text-34 leading-[39px] font-semibold tracking-heading sm:text-48 sm:leading-[52px]">
            {page.title}
          </h1>
          <p className="text-18 leading-7 text-graphite">{page.description}</p>
        </header>
        {page.sections.map((section, index) => (
          <section
            key={section.heading}
            aria-labelledby={`section-${index}`}
            className="border-t border-border pt-6"
          >
            <h2
              id={`section-${index}`}
              className="mb-4 font-display text-26 leading-snug font-semibold tracking-heading"
            >
              {section.heading}
            </h2>
            <p className="text-16 leading-7 text-graphite">{section.body}</p>
          </section>
        ))}
      </article>
      <nav aria-label="Related reading" className="border-t border-border pt-6">
        <h2 className="mb-3 text-14 font-semibold">Keep exploring</h2>
        <ul>
          {page.related.map((href) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex min-h-11 items-center py-2 text-16 text-ink underline decoration-border underline-offset-4 hover:decoration-ink focus-visible:outline-cadmium"
              >
                {pages.find((candidate) => candidate.path === href)?.title ||
                  href.split("/").pop()!.replaceAll("-", " ")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {page.kind !== "legal" ? <BlogInvitation /> : null}
    </main>
  );
}
