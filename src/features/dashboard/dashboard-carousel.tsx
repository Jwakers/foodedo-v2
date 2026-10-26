import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  RecipeSaveButton,
  type RecipeSaveControl,
} from "@/features/recipes/recipe-save-button";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";

export function DashboardCarousel({
  headingId,
  title,
  href,
  action,
  children,
  className,
}: {
  className?: string;
  headingId: string;
  title: string;
  href: string;
  action: string;
  children: ReactNode;
}) {
  return (
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
        <ButtonLink href={href} variant="inline" className="shrink-0 text-ink">
          {action}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>
      <div className="-mx-page-inline snap-x snap-mandatory scroll-px-page-inline overflow-x-auto pb-1 scrollbar-none sm:-mx-8 sm:scroll-px-8">
        {children}
      </div>
    </section>
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
  saveControl,
}: {
  title: string;
  imageSrc?: string | null;
  href: string | null;
  meta?: ReactNode;
  saveControl?: RecipeSaveControl;
}) {
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

  return saveControl ? (
    <div className="relative">
      {card}
      <RecipeSaveButton title={title} {...saveControl} />
    </div>
  ) : (
    card
  );
}
