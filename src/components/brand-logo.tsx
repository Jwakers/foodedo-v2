import Link from "next/link";

import { cn } from "@/lib/utils/cn";

const brandLogoClassName =
  "font-display text-26 font-bold tracking-brand text-ink";

type BrandLogoProps = {
  className?: string;
  /** When set, renders the mark as a home/navigation link. */
  href?: string;
};

/**
 * Text wordmark used as the brand logo until a graphic mark ships.
 */
export function BrandLogo({ className, href }: BrandLogoProps) {
  const classes = cn(brandLogoClassName, className);

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          classes,
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium",
        )}
      >
        Foodedo
      </Link>
    );
  }

  return <span className={classes}>Foodedo</span>;
}
