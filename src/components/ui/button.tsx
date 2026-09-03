import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

type ButtonVariant = "primary" | "secondary";

const variantClassNames: Record<ButtonVariant, string> = {
  primary:
    "bg-cadmium text-paper text-base hover:opacity-90 focus-visible:outline-cadmium disabled:cursor-wait disabled:opacity-55",
  secondary:
    "border border-control-muted bg-paper text-ink text-sm hover:border-ink focus-visible:outline-ink disabled:cursor-not-allowed disabled:border-border disabled:text-graphite",
};

export function buttonClassName({
  variant = "primary",
  className,
}: {
  variant?: ButtonVariant;
  className?: string;
} = {}) {
  return cn(
    "inline-flex h-12 items-center justify-center gap-2 rounded-compact px-page-inline font-ui font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
    variantClassNames[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, className })}
      {...props}
    />
  );
}
