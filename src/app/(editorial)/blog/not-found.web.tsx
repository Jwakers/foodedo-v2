import Link from "next/link";

export default function ArticleNotFound() {
  return (
    <main
      id="editorial-content"
      className="mx-auto w-full max-w-190 px-page-inline py-16"
    >
      <h1 className="font-display text-34 font-semibold tracking-heading">
        Article not found
      </h1>
      <p className="mt-4 text-18 leading-7 text-graphite">
        This article may have moved or is no longer published.
      </p>
      <Link
        href="/blog"
        className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Back to Blog
      </Link>
    </main>
  );
}
