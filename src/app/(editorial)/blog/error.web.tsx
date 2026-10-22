"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BlogError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main
      id="editorial-content"
      className="mx-auto w-full max-w-190 px-page-inline py-16"
    >
      <h1 className="font-display text-34 font-semibold tracking-heading">
        The blog is taking a moment.
      </h1>
      <p className="mt-4 text-18 leading-7 text-graphite">
        We couldn’t load the articles. Please try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <Button onClick={retry}>Try again</Button>
        <Link
          href="/blog/how-to-build-a-weekly-meal-plan-in-15-minutes"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Read a planning guide
        </Link>
      </div>
    </main>
  );
}
