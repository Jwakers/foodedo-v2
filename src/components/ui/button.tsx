import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Primary / secondary bake in the default filled measure.
 * `ghost` is secondary’s filled measure without border or background.
 * `leaf` + `chip` is the empty plan-day “Add meal” control.
 * `quiet` + `icon` is the meal-row ellipsis.
 * `ghost` + `headerIcon` is the plain drawer-stack Back / Close control.
 * `ghost` + `rowIcon` is a list-row trailing icon action (full row height).
 * `inline` + `block` is the full-width secondary text action.
 * `filter` is the quick-filter / filter-drawer chip (use `aria-pressed`).
 * `filter` + `filterIcon` is the circular open-filters control.
 * `choice` is a pill-shaped option in a segmented choice group.
 * `counter` is a circular increment / decrement control.
 * `search` is the field-like trigger used to open recipe search.
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
        ghost:
          "h-12 justify-center gap-2 rounded-compact px-page-inline text-ink text-sm hover:bg-mist disabled:text-graphite",
        filter:
          "h-9.5 shrink-0 justify-center whitespace-nowrap rounded-full border border-border px-3.5 text-13 font-medium text-ink hover:bg-mist aria-pressed:border-transparent aria-pressed:bg-ink aria-pressed:text-paper",
        choice:
          "h-11 justify-center rounded-full border border-border bg-paper text-13 font-semibold text-ink hover:bg-mist aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper aria-pressed:hover:bg-ink",
        counter:
          "size-11 shrink-0 justify-center rounded-full border border-border text-ink hover:border-ink disabled:text-control-muted",
        search:
          "h-12 w-full shrink-0 justify-start gap-2.5 rounded-md bg-mist px-3.5 text-left font-medium text-graphite hover:bg-border",
      },
      size: {
        default: "",
        chip: "h-6.5 whitespace-nowrap rounded-sm px-2.5 text-10 font-semibold",
        icon: "size-8 shrink-0 justify-center rounded-sm",
        // Plain 44px control used by drawer-stack headers.
        headerIcon: "size-11 shrink-0 justify-center rounded-full p-0",
        // List-row trailing icon (Shopping remove / details) — pair with ghost.
        rowIcon: "h-14 w-11 shrink-0 justify-center rounded-sm p-0",
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
  ref,
  ...props
}: ComponentPropsWithRef<"button"> & ButtonVariantProps) {
  return (
    <button
      ref={ref}
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
