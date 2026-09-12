import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Primary / secondary bake in the default filled measure.
 * `leaf` + `chip` is the empty plan-day “Add meal” control.
 * `quiet` + `icon` is the meal-row ellipsis.
 * `ghost` + `headerIcon` is the plain drawer-stack Back / Close control.
 * `inline` + `block` is the full-width secondary text action.
 * `filter` is the quick-filter / filter-drawer chip (use `aria-pressed`).
 * `filter` + `filterIcon` is the circular open-filters control.
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
        inline: "gap-1 text-ink disabled:text-graphite",
        leaf: "justify-center bg-leaf text-paper hover:opacity-90",
        quiet: "justify-center bg-mist text-graphite hover:bg-border",
        ghost: "justify-center text-ink hover:bg-mist",
        filter:
          "h-9.5 shrink-0 justify-center whitespace-nowrap rounded-full border border-border px-3.5 text-13 font-medium text-ink hover:bg-mist aria-pressed:border-transparent aria-pressed:bg-ink aria-pressed:text-paper",
      },
      size: {
        default: "",
        chip: "h-6.5 whitespace-nowrap rounded-sm px-2.5 text-10 font-semibold",
        icon: "size-8 shrink-0 justify-center rounded-sm",
        // Plain 44px control used by drawer-stack headers.
        headerIcon: "size-11 shrink-0 justify-center rounded-full",
        // Circular open-filters control beside filter chips (Paper: 38×42).
        filterIcon: "w-10.5 px-0",
        // Compact text control (Paper: 28px / 13px label).
        sm: "h-7 text-13 leading-4.5",
        // Full-width secondary text action under a primary CTA.
        block: "h-11 w-full justify-center text-14 font-semibold",
      },
    },
    compoundVariants: [
      {
        variant: "inline",
        size: "default",
        class: "h-7 text-13 leading-4.5",
      },
      {
        variant: "filter",
        size: "filterIcon",
        class: "px-0",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "default",
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
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonVariantProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
