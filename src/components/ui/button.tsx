import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Filled buttons share one approved measure for now. Inline is the compact
 * text control (Paper: 28px / 13px label). Add a `size` axis with
 * compoundVariants when a second measure exists per variant.
 */
export const buttonVariants = cva(
  "inline-flex items-center font-ui font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "h-12 justify-center gap-2 rounded-compact px-page-inline bg-cadmium text-paper text-base hover:opacity-90 disabled:cursor-wait disabled:opacity-55",
        secondary:
          "h-12 justify-center gap-2 rounded-compact px-page-inline border border-control-muted bg-paper text-ink text-sm hover:border-ink disabled:border-border disabled:text-graphite",
        // Text colour is left to the caller (`text-leaf`, `text-ink`, …).
        inline: "h-7 gap-1 text-13 leading-4.5 disabled:text-graphite",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export function buttonClassName({
  className,
  ...variants
}: ButtonVariantProps & { className?: string } = {}) {
  return cn(buttonVariants(variants), className);
}

export function Button({
  variant,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonVariantProps) {
  return (
    <Link className={buttonClassName({ variant, className })} {...props} />
  );
}
