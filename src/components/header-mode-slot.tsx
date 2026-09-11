import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Stacked header action region that crossfades between modes.
 * Keeps inactive controls out of pointer and accessibility trees via `inert`.
 * Pair with CSS width/padding transitions on sibling slots for layout motion.
 */
export function HeaderModeSlot({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "col-start-1 row-start-1 flex items-center transition-opacity duration-300 ease-out",
        active ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </div>
  );
}
