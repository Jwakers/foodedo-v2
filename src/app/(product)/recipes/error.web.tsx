"use client";

import { Button } from "@/components/ui/button";

export default function RecipeError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main
      id="editorial-content"
      className="mx-auto w-full max-w-175 px-page-inline py-16"
    >
      <h1 className="font-display text-34 font-semibold tracking-heading">
        The kitchen is taking a moment.
      </h1>
      <p className="mt-4 text-18 leading-7 text-graphite">
        We couldn’t load the recipes. Please try again in a moment.
      </p>
      <Button onClick={retry} className="mt-6">
        Try again
      </Button>
    </main>
  );
}
