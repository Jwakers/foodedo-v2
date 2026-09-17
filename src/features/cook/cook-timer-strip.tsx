"use client";

import { MoreHorizontal, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  remainingTimerSeconds,
  type CookTimerState,
} from "@/lib/domain/cook-session";

export function CookTimerStrip({
  timer,
  now,
  menuOpen,
  onToggle,
  onMenuToggle,
  onMenuClose,
  onCancel,
  onRestart,
}: {
  timer: CookTimerState;
  now: number;
  menuOpen: boolean;
  onToggle: () => void;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onCancel: () => void;
  onRestart: () => void;
}) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const remaining = remainingTimerSeconds(timer, now);
  const expired = remaining === 0;

  useEffect(() => {
    if (!menuOpen) return;
    firstMenuItemRef.current?.focus();
    const closeForOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onMenuClose();
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onMenuClose();
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeForOutsidePointer);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("pointerdown", closeForOutsidePointer);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, [menuOpen, onMenuClose]);

  return (
    <div
      ref={containerRef}
      className="relative mt-5 flex items-center gap-3 rounded-compact border border-border bg-leaf-soft px-3 py-2.5"
    >
      <p className="min-w-0 flex-1 text-14 font-semibold text-ink">
        <span className="mr-2 inline-block size-2 rounded-full bg-leaf" />
        {timer.label} ·{" "}
        <span className="tabular-nums">
          {expired ? "Finished" : formatDuration(remaining)}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="inline"
          className="min-h-11 px-2 text-13 text-leaf"
          onClick={onToggle}
        >
          {expired ? (
            <RotateCcw className="size-3.5" />
          ) : timer.startedAt === null ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {expired ? "Restart" : timer.startedAt === null ? "Resume" : "Pause"}
        </Button>
        <Button
          ref={menuButtonRef}
          variant="inline"
          className="size-11 shrink-0 justify-center rounded-full text-graphite"
          aria-label={`Timer options for ${timer.label}`}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-expanded={menuOpen}
          onClick={onMenuToggle}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Timer options for ${timer.label}`}
          className="absolute top-[calc(100%+4px)] right-0 z-10 flex min-w-40 flex-col rounded-compact border border-border bg-paper p-1 shadow-lg"
        >
          <Button
            ref={firstMenuItemRef}
            role="menuitem"
            variant="inline"
            className="h-11 justify-start px-2 text-13"
            onClick={onRestart}
          >
            <RotateCcw className="size-3.5" />
            Restart timer
          </Button>
          <Button
            role="menuitem"
            variant="inline"
            className="h-11 justify-start px-2 text-13 text-cadmium"
            onClick={onCancel}
          >
            <Trash2 className="size-3.5" />
            Cancel timer
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0
    ? `${minutes} min`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
