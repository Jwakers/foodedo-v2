import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils/cn";
import { TryFoodedoLink } from "./try-foodedo-link";

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-3 rounded-full bg-cadmium px-4 py-3 text-14 font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium";

export function EditorialShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#editorial-content"
        className="sr-only z-50 rounded-sm bg-paper p-3 focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-360 items-center justify-between px-page-inline py-3 lg:px-24 lg:py-6">
          <BrandLogo href="/" />
          <nav aria-label="Blog navigation" className="flex items-center gap-6">
            <Link
              href="/blog"
              className="hidden min-h-11 items-center text-14 underline-offset-4 hover:underline focus-visible:outline-cadmium sm:inline-flex"
            >
              Blog
            </Link>
            <TryFoodedoLink className={actionClass}>
              Try Foodedo
              <ArrowRight className="size-5" aria-hidden="true" />
            </TryFoodedoLink>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mt-auto border-t border-border">
        <div className="mx-auto flex max-w-360 flex-col justify-between gap-4 px-page-inline pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-14 text-graphite sm:flex-row sm:items-center lg:px-24 lg:py-8">
          <p>Foodedo · Make food decisions easier.</p>
          <nav aria-label="Blog footer" className="flex gap-6">
            <Link
              href="/blog"
              className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:underline"
            >
              Blog
            </Link>
            <TryFoodedoLink className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
              Try Foodedo
            </TryFoodedoLink>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function BlogInvitation({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="blog-invitation"
      className={cn(
        "flex flex-col items-start gap-4 rounded-hero bg-mist p-6 sm:p-10",
        className,
      )}
    >
      <h2
        id="blog-invitation"
        className="font-display text-30 leading-snug font-semibold tracking-heading sm:text-34"
      >
        Make this week a little easier.
      </h2>
      <p className="max-w-130 text-16 leading-6 text-graphite">
        Let Foodedo help with what to eat and what to buy.
      </p>
      <TryFoodedoLink
        className={cn(actionClass, "w-full px-6 py-3.5 text-16 sm:w-auto")}
      >
        Try Foodedo
        <ArrowRight className="size-5" aria-hidden="true" />
      </TryFoodedoLink>
      <p className="text-14 leading-5.25 text-graphite">
        No account needed to try it. Create one when you want to keep your plan.
      </p>
    </section>
  );
}
