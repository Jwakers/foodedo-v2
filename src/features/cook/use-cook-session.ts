"use client";

import { useEffect, useEffectEvent, useReducer, useState } from "react";

import {
  emptyCookSession,
  reduceCookSession,
  type CookRecipeContext,
  type CookScrollPositions,
  type CookSessionAction,
} from "@/lib/domain/cook-session";
import {
  clearCookSession,
  readCookSession,
  writeCookSession,
} from "@/lib/platform/cook-session-store";

export function useCookSession(context: CookRecipeContext) {
  const [session, dispatch] = useReducer(
    reduceCookSession,
    context,
    emptyCookSession,
  );
  const [loaded, setLoaded] = useState(false);
  const [persistenceAvailable, setPersistenceAvailable] = useState(true);
  const contextKey = `${context.meal.slug}:${context.catalogueVersion}:${context.servings}`;

  useEffect(() => {
    let cancelled = false;
    void readCookSession(context)
      .then((stored) => {
        if (cancelled) return;
        dispatch({ type: "replace", session: stored });
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({ type: "replace", session: emptyCookSession(context) });
        setPersistenceAvailable(false);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // contextKey deliberately represents the serializable recovery boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  useEffect(() => {
    if (!loaded || session.phase.name === "complete") return;
    void writeCookSession(session).catch(() => {
      setPersistenceAvailable(false);
    });
  }, [loaded, session]);

  const complete = () => {
    dispatch({ type: "complete" });
    void clearCookSession(context.meal.slug).catch(() => {
      setPersistenceAvailable(false);
    });
  };

  return {
    session,
    dispatch,
    loaded,
    persistenceAvailable,
    complete,
  };
}

export function useCookScrollRecovery({
  loaded,
  surface,
  scrollKey,
  scrollTop,
  dispatch,
}: {
  loaded: boolean;
  surface: keyof CookScrollPositions;
  scrollKey: string;
  scrollTop: number;
  dispatch: (action: CookSessionAction) => void;
}) {
  const restoreScroll = useEffectEvent(() => {
    window.scrollTo({ top: scrollTop });
  });
  const persistScroll = useEffectEvent(
    (targetSurface: keyof CookScrollPositions, position: number) => {
      dispatch({
        type: "set-scroll",
        surface: targetSurface,
        scrollTop: position,
      });
    },
  );
  const getLatestScrollKey = useEffectEvent(() => scrollKey);

  useEffect(() => {
    if (!loaded) return;
    restoreScroll();

    let pending = false;
    let timeoutId: number | undefined;
    const scheduleScrollSave = () => {
      window.clearTimeout(timeoutId);
      pending = true;
      timeoutId = window.setTimeout(() => {
        pending = false;
        persistScroll(surface, window.scrollY);
      }, 150);
    };
    window.addEventListener("scroll", scheduleScrollSave, { passive: true });
    return () => {
      window.removeEventListener("scroll", scheduleScrollSave);
      window.clearTimeout(timeoutId);
      const nextKey = getLatestScrollKey();
      const switchingBetweenSteps =
        scrollKey.startsWith("step:") &&
        nextKey.startsWith("step:") &&
        nextKey !== scrollKey;
      if (switchingBetweenSteps || !pending) return;
      persistScroll(surface, window.scrollY);
    };
  }, [loaded, scrollKey, surface]);
}
