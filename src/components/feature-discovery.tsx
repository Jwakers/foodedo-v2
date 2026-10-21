import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/** Quiet feature discovery with shared icon, copy and action alignment. */
export function FeatureDiscovery({
  headingId,
  href,
  label,
  title,
  action,
  icon,
  tone,
  ariaLabel = action,
  className,
}: {
  headingId: string;
  href: string;
  label: string;
  title: string;
  action: string;
  icon: ReactNode;
  tone: "cadmium" | "leaf";
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "mx-auto w-full max-w-175 border-t border-border pt-5",
        className,
      )}
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        className="flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-md",
            tone === "cadmium"
              ? "bg-cadmium-soft text-ink"
              : "bg-leaf-soft text-leaf",
          )}
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={cn(
              "text-12 leading-4.5 font-bold tracking-label uppercase",
              tone === "cadmium" ? "text-cadmium" : "text-leaf",
            )}
          >
            {label}
          </p>
          <h2
            id={headingId}
            className="font-display text-22 font-semibold leading-6.5 tracking-card text-ink"
          >
            {title}
          </h2>
          <span className="flex min-h-11 items-center gap-2 text-14 font-semibold leading-5 text-leaf">
            {action}
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </span>
        </div>
      </Link>
    </section>
  );
}
