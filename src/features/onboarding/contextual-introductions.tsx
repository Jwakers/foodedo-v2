"use client";

import { Heart, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { IntroductionId } from "@/lib/domain/onboarding";
import { cn } from "@/lib/utils/cn";
import { useOnboarding } from "./use-onboarding";

/** Shared visibility, dismissal and touch-target contract; content stays local. */
export function ContextualIntroduction({
  id,
  label,
  children,
  className,
}: {
  id: IntroductionId;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { ready, isRetired, retire } = useOnboarding();
  if (!ready || isRetired(id)) return null;
  return (
    <aside
      aria-label={label}
      className={cn(
        "mt-6 flex gap-1 rounded-md bg-mist py-4 pr-2 pl-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        variant="ghost"
        size="headerIcon"
        aria-label={`Dismiss ${label.toLowerCase()}`}
        onClick={() => retire(id)}
      >
        <X aria-hidden="true" className="size-4.5" />
      </Button>
    </aside>
  );
}

export function HomeIntroduction() {
  return (
    <ContextualIntroduction id="home" label="Planning introduction">
      <h2 className="font-display text-22 leading-6.75 font-semibold tracking-card text-ink">
        Start with a suggestion
      </h2>
      <p className="mt-2 text-14 leading-5.5 text-graphite">
        Foodedo suggests your week. Swap any meal or leave days free to fit your
        plans.
      </p>
    </ContextualIntroduction>
  );
}

export function RecipesIntroduction() {
  return (
    <ContextualIntroduction
      id="recipes"
      label="Saving recipes introduction"
      className="items-center py-2 pr-1 pl-3"
    >
      <div className="flex items-center gap-2.5">
        <Heart
          aria-hidden="true"
          className="size-4.5 shrink-0 text-graphite"
          strokeWidth={1.6}
        />
        <p className="flex-1 text-14 leading-5 text-graphite">
          Tap the heart to keep favourites in Saved and help shape future plans.
        </p>
      </div>
    </ContextualIntroduction>
  );
}
