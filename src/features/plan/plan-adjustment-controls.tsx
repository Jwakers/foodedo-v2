"use client";

import { Check } from "lucide-react";
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

export function DietaryPreferencesStub() {
  return (
    <div className="mt-3 flex min-h-12.5 items-center gap-2.5 rounded-md bg-leaf-soft px-3.5">
      <Check aria-hidden="true" className="size-4.5 shrink-0 text-leaf" />
      <p className="min-w-0 flex-1 text-13 font-medium text-leaf">
        Dietary preferences
      </p>
      <Button
        variant="inline"
        className="h-11 shrink-0 text-12 font-semibold text-leaf"
        disabled
      >
        Coming soon
      </Button>
    </div>
  );
}
