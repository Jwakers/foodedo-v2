import {
  PortableText,
  type PortableTextComponents,
  type PortableTextTypeComponentProps,
} from "@portabletext/react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  blogImageUrl,
  blogImageDimensions,
  inlineImageSchema,
  bodyImageSchema,
  resolveBlogLink,
  type BlogArticle,
} from "./content";
import { TryFoodedoLink } from "./try-foodedo-link";

const headingClass =
  "font-display text-26 leading-8 font-semibold tracking-title";

function InlineImage({ value }: PortableTextTypeComponentProps<unknown>) {
  const parsed = inlineImageSchema.or(bodyImageSchema).safeParse(value);
  if (!parsed.success) return null;
  const { alt, caption } = parsed.data;
  const image = parsed.data._type === "image" ? parsed.data : parsed.data.image;
  const url = blogImageUrl(image, 1440);
  if (!url || !image) return null;
  return (
    <figure className="my-8 flex flex-col gap-2.5">
      <Image
        src={url}
        alt={alt || image.alt || ""}
        {...blogImageDimensions(image)}
        sizes="(max-width: 760px) calc(100vw - 40px), 720px"
        className="h-auto w-full rounded-media"
      />
      {caption ? (
        <figcaption className="text-14 leading-5.25 text-graphite">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function ArticleLink({
  href,
  children,
}: {
  href: unknown;
  children: ReactNode;
}) {
  const resolved = resolveBlogLink(href);
  if (!resolved) return <>{children}</>;
  const className =
    "rounded-sm underline decoration-control-muted underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium";
  if (resolved.startsWith("/?try=1"))
    return (
      <TryFoodedoLink href={resolved} className={className}>
        {children}
      </TryFoodedoLink>
    );
  if (resolved.startsWith("/"))
    return (
      <Link href={resolved} prefetch={false} className={className}>
        {children}
      </Link>
    );
  return (
    <a href={resolved} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

const components: PortableTextComponents = {
  types: { pteImage: InlineImage, image: InlineImage },
  block: {
    normal: ({ children }) => <p>{children}</p>,
    // Older CMS bodies contain h1s. Keep one page-level h1 and retain the text.
    h1: ({ children }) => <h2 className={headingClass}>{children}</h2>,
    h2: ({ children }) => <h2 className={headingClass}>{children}</h2>,
    h3: ({ children }) => (
      <h3 className="text-20 leading-7 font-semibold tracking-card">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-18 leading-7 font-semibold">{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-cadmium pl-6 text-graphite">
        {children}
      </blockquote>
    ),
  },
  marks: {
    link: ({ children, value }) => (
      <ArticleLink href={value?.href}>{children}</ArticleLink>
    ),
  },
  list: {
    bullet: ({ children }) => (
      <ul className="list-disc space-y-2 pl-6">{children}</ul>
    ),
    number: ({ children }) => (
      <ol className="list-decimal space-y-2 pl-6">{children}</ol>
    ),
  },
};

export function ArticleBody({
  body,
  title,
}: {
  body: BlogArticle["body"];
  title?: string;
}) {
  const first = body?.[0];
  // Some V1 posts repeat the page title as their first body H1. Keep that title
  // in the article header once; preserve all other authored headings and text.
  const repeatsTitle =
    first?._type === "block" &&
    first.style === "h1" &&
    first.children
      .map((span) => span.text)
      .join("")
      .trim() === title?.trim();
  const content = repeatsTitle ? body?.slice(1) : body;
  return (
    <div className="space-y-6 text-18 leading-[29px] wrap-break-word [&_h2]:pt-2 [&_h3]:pt-2 [&_li>ul]:mt-2 [&_li>ol]:mt-2">
      <PortableText value={content ?? []} components={components} />
    </div>
  );
}
