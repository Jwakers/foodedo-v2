"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, type ReactNode } from "react";

import { RecipeSaveButton } from "@/features/recipes/recipe-save-button";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";

const CarouselLibraryContext = createContext<ReturnType<
  typeof useCatalogueRecipeLibrary
> | null>(null);

export function DashboardCarousel({
  headingId,
  title,
  href,
  action,
  children,
  className,
  showSaveButton = true,
}: {
  className?: string;
  showSaveButton?: boolean;
  headingId: string;
  title: string;
  href: string;
  action: string;
  children: ReactNode;
}) {
  const library = useCatalogueRecipeLibrary();

  return (
    <CarouselLibraryContext.Provider value={showSaveButton ? library : null}>
      <section
        aria-labelledby={headingId}
        className={cn("flex flex-col gap-3", className)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={headingId}
            className="font-display text-22 font-semibold leading-6.5 text-ink"
          >
            {title}
          </h2>
          <ButtonLink
            href={href}
            variant="inline"
            className="shrink-0 text-ink"
          >
            {action}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </ButtonLink>
        </div>
        <div className="-mx-page-inline snap-x snap-mandatory scroll-px-page-inline overflow-x-auto pb-1 scrollbar-none sm:-mx-8 sm:scroll-px-8">
          {children}
        </div>
      </section>
    </CarouselLibraryContext.Provider>
  );
}

export function DashboardCarouselList({ children }: { children: ReactNode }) {
  return (
    <ul className="flex w-max gap-2 px-page-inline sm:px-8">{children}</ul>
  );
}

export function DashboardCarouselItem({ children }: { children: ReactNode }) {
  return <li className="w-37 shrink-0 snap-start">{children}</li>;
}

export function DashboardCarouselCard({
  title,
  imageSrc,
  href,
  meta,
  meal,
}: {
  title: string;
  imageSrc?: string | null;
  href: string | null;
  meta?: ReactNode;
  meal: Pick<CatalogueMealSummary, "id" | "version">;
}) {
  const library = useContext(CarouselLibraryContext);
  const content = (
    <>
      <div className="relative aspect-37/24 overflow-hidden rounded-compact bg-mist">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="148px"
            className="object-cover"
          />
        ) : null}
      </div>
      {meta ? (
        <p className="text-11 font-bold tracking-overline text-graphite uppercase">
          {meta}
        </p>
      ) : null}
      <p className="line-clamp-3 font-display text-16 font-semibold leading-4.5 text-ink">
        {formatRecipeHeading(title)}
      </p>
    </>
  );

  const card = href ? (
    <Link
      href={href}
      className="flex flex-col gap-1.75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
    >
      {content}
    </Link>
  ) : (
    <div className="flex flex-col gap-1.75">{content}</div>
  );

  return library ? (
    <div className="relative">
      {card}
      <RecipeSaveButton
        title={title}
        compact
        saved={library.isSaved(meal.id)}
        isSaveDisabled={library.isSaveDisabled}
        onToggleSave={() =>
          library.toggleSave({
            catalogueMealId: meal.id,
            catalogueVersion: meal.version,
            title,
          })
        }
      />
    </div>
  ) : (
    card
  );
}
