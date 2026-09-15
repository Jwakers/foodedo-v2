"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type GuestPlanReviewChromeContextValue = {
  hideDock: boolean;
  setHideDock: (hide: boolean) => void;
};

const GuestPlanReviewChromeContext =
  createContext<GuestPlanReviewChromeContextValue | null>(null);

export function GuestPlanReviewChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [hideDock, setHideDock] = useState(false);
  const value = useMemo(
    () => ({ hideDock, setHideDock }),
    [hideDock],
  );

  return (
    <GuestPlanReviewChromeContext.Provider value={value}>
      {children}
    </GuestPlanReviewChromeContext.Provider>
  );
}

export function useGuestPlanReviewDockHidden(): boolean {
  return useContext(GuestPlanReviewChromeContext)?.hideDock ?? false;
}

/**
 * Guest plan review is a focused temporary state — hide the global dock while
 * the ready review is on screen. Header (brand + Sign in) stays.
 */
export function useGuestPlanReviewDockEffect(active: boolean) {
  const context = useContext(GuestPlanReviewChromeContext);

  useEffect(() => {
    if (!context) return;
    context.setHideDock(active);
    return () => {
      context.setHideDock(false);
    };
  }, [active, context]);
}
