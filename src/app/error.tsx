"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-6 py-16 sm:px-10"
      aria-labelledby="app-error-heading"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-danger uppercase">
        Something went wrong
      </p>
      <h1
        id="app-error-heading"
        className="mt-3 max-w-2xl font-display text-5xl leading-tight tracking-[-0.04em] text-foreground"
      >
        Foodedo hit a snag.
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
        Your action may not have completed. Try loading this part of the app
        again.
      </p>
      <button
        type="button"
        className="mt-8 inline-flex min-h-12 w-fit items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={retry}
      >
        Try again
      </button>
    </main>
  );
}
