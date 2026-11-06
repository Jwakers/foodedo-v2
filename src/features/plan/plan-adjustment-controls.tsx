"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function PlanCounterButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="counter"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function PlanScopeOption({
  name,
  checked,
  title,
  description,
  onChange,
}: {
  name: string;
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-sm border px-3 py-1.5",
        checked ? "border-ink bg-mist" : "border-border bg-paper",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        className="size-5 accent-ink"
        onChange={onChange}
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-13 font-semibold text-ink">{title}</span>
        <span className="text-11 text-graphite">{description}</span>
      </span>
    </label>
  );
}
