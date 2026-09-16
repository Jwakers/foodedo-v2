"use client";

import { Code2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  unfinishedInteractionEvent,
  type UnfinishedInteractionDetail,
} from "@/lib/ui/unfinished-interaction";
import { cn } from "@/lib/utils/cn";

const reminderDurationMs = 5_000;

export function UnfinishedInteractionViewport({
  dockVisible,
}: {
  dockVisible: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearReminder() {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setMessage(null);
    }

    function handleUnfinishedInteraction(event: Event) {
      const detail = (event as CustomEvent<UnfinishedInteractionDetail>).detail;
      if (!detail?.message) return;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      setMessage(detail.message);
      timeoutRef.current = setTimeout(clearReminder, reminderDurationMs);
    }

    window.addEventListener(
      unfinishedInteractionEvent,
      handleUnfinishedInteraction,
    );
    return () => {
      window.removeEventListener(
        unfinishedInteractionEvent,
        handleUnfinishedInteraction,
      );
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (message === null) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-page-inline z-60 mx-auto flex max-w-167 items-start gap-3 rounded-sm border border-dashed border-cadmium bg-cadmium-soft px-3.5 py-3 font-mono text-ink shadow-lg",
        dockVisible
          ? "bottom-[calc(var(--app-nav-height)+var(--space-16)+var(--space-3))]"
          : "bottom-[calc(env(safe-area-inset-bottom)+var(--space-16)+var(--space-4))]",
      )}
    >
      <Code2
        aria-hidden="true"
        className="mt-0.5 size-4.5 shrink-0 text-cadmium"
      />
      <div className="min-w-0 flex-1">
        <p className="text-10 font-bold tracking-overline text-cadmium uppercase">
          Dev reminder · unfinished
        </p>
        <p className="mt-1 text-13 leading-relaxed">{message}</p>
      </div>
      <Button
        variant="ghost"
        size="headerIcon"
        aria-label="Dismiss reminder"
        onClick={() => {
          if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setMessage(null);
        }}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
