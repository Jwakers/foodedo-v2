"use client";

import { ArrowLeftRight, Sparkles, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  DrawerBody,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils/cn";

export function PlanMealActions({
  mealTitle,
  isRemoving = false,
  onChooseRecipe,
  onChooseForMe,
  onRemove,
}: {
  mealTitle: string;
  isRemoving?: boolean;
  onChooseRecipe: () => void;
  onChooseForMe: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <DrawerHeader className="flex-col items-stretch gap-0.5 px-page-inline pt-0.5 pb-2">
        <DrawerTitle className="font-ui text-14 font-bold tracking-normal text-ink">
          {mealTitle}
        </DrawerTitle>
        <DrawerDescription className="text-12 text-graphite">
          What would you like to do?
        </DrawerDescription>
      </DrawerHeader>

      <DrawerBody className="flex flex-col gap-2 pb-7">
        <MealActionRow
          icon={
            <ArrowLeftRight
              aria-hidden="true"
              className="size-3.5"
              strokeWidth={1.8}
            />
          }
          iconClassName="bg-mist text-ink"
          title="Choose a recipe"
          description="Browse and pick it yourself"
          disabled={isRemoving}
          onClick={onChooseRecipe}
        />
        <MealActionRow
          icon={
            <Sparkles
              aria-hidden="true"
              className="size-3.5"
              strokeWidth={1.8}
            />
          }
          iconClassName="bg-leaf text-leaf-soft"
          className="bg-leaf-soft hover:bg-leaf-soft"
          title="Choose for me"
          titleClassName="font-bold text-leaf"
          description="Foodedo finds a good match"
          disabled={isRemoving}
          onClick={onChooseForMe}
        />

        <div className="h-px shrink-0 bg-border" role="separator" />

        <MealActionRow
          icon={
            <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          }
          iconClassName="bg-cadmium-soft text-cadmium"
          title="Remove from plan"
          titleClassName="text-cadmium"
          disabled={isRemoving}
          busy={isRemoving}
          onClick={onRemove}
        />
      </DrawerBody>
    </>
  );
}

function MealActionRow({
  icon,
  iconClassName,
  className,
  title,
  titleClassName,
  description,
  onClick,
  disabled = false,
  busy = false,
}: {
  icon: ReactNode;
  iconClassName?: string;
  className?: string;
  title: string;
  titleClassName?: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-sm p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:cursor-wait disabled:opacity-55",
        className ?? "bg-paper hover:bg-mist",
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          iconClassName,
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span
          className={cn(
            "font-ui text-14 font-semibold text-ink",
            titleClassName,
          )}
        >
          {title}
        </span>
        {description ? (
          <span className="text-12 text-graphite">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
