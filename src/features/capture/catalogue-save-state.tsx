"use client";

import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../../../convex/_generated/api";
import {
  createCatalogueSaveIntent,
  readCatalogueSaveIntent,
  type CatalogueSaveIntentV1,
} from "@/lib/domain/auth-intents";
import { findStandardCatalogueMeal } from "@/lib/domain/standard-catalogue";
import { createCatalogueSaveIntentStore } from "@/lib/platform/auth-intent-store";

const isSaveConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
);

type CatalogueSaveState = {
  isLoading: boolean;
  isSignedIn: boolean;
  savedMealIds: ReadonlySet<string>;
  pendingMealId: string | null;
  failure: CatalogueSaveFailure | null;
  requestSave(catalogueMealId: string): Promise<void>;
};

type CatalogueSaveFailure = {
  catalogueMealId: string | null;
  reason: "catalogue_unsupported" | "storage" | "unexpected";
};

const emptySavedMealIds = new Set<string>();
const CatalogueSaveStateContext = createContext<CatalogueSaveState>({
  isLoading: false,
  isSignedIn: false,
  savedMealIds: emptySavedMealIds,
  pendingMealId: null,
  failure: null,
  requestSave: async () => undefined,
});

export function CatalogueSaveStateProvider({
  catalogueVersion,
  children,
}: {
  catalogueVersion: number;
  children: ReactNode;
}) {
  if (!isSaveConfigured) return children;

  return (
    <ConfiguredCatalogueSaveStateProvider catalogueVersion={catalogueVersion}>
      {children}
    </ConfiguredCatalogueSaveStateProvider>
  );
}

function ConfiguredCatalogueSaveStateProvider({
  catalogueVersion,
  children,
}: {
  catalogueVersion: number;
  children: ReactNode;
}) {
  const clerk = useClerk();
  const { userId } = useClerkAuth();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const saveCatalogueMeal = useMutation(api.recipes.saveCatalogueMeal);
  const savedMealIds = useQuery(
    api.recipes.listSavedCatalogueMealIds,
    isAuthenticated ? { catalogueVersion } : "skip",
  );
  const store = useMemo(() => createCatalogueSaveIntentStore(), []);
  const attemptedIntent = useRef<string | null>(null);
  const [pendingIntent, setPendingIntent] =
    useState<CatalogueSaveIntentV1 | null>(null);
  const [confirmedMealIds, setConfirmedMealIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [failure, setFailure] = useState<CatalogueSaveFailure | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void store
      .read()
      .then(async (stored) => {
        const intent = readCatalogueSaveIntent(stored);
        const isCurrent =
          intent !== null &&
          intent.catalogueVersion === catalogueVersion &&
          findStandardCatalogueMeal(
            intent.catalogueMealId,
            intent.catalogueVersion,
          ) !== null;

        if (!isCurrent && stored !== null) await store.clear();
        if (!cancelled) setPendingIntent(isCurrent ? intent : null);
      })
      .catch(() => {
        if (!cancelled) {
          setFailure({ catalogueMealId: null, reason: "storage" });
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogueVersion, store]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated || pendingIntent === null) return;

    const intentIdentity = `${pendingIntent.catalogueMealId}:${pendingIntent.requestedAt}`;
    if (attemptedIntent.current === intentIdentity) return;

    if (savedMealIds?.includes(pendingIntent.catalogueMealId)) {
      attemptedIntent.current = intentIdentity;
      let cancelled = false;
      void store.clear().then(() => {
        if (cancelled) return;
        setConfirmedMealIds((current) =>
          new Set(current).add(pendingIntent.catalogueMealId),
        );
        setPendingIntent(null);
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    attemptedIntent.current = intentIdentity;

    void saveCatalogueMeal({
      catalogueMealId: pendingIntent.catalogueMealId,
      catalogueVersion: pendingIntent.catalogueVersion,
    })
      .then(async (result) => {
        if (cancelled) return;
        if (result.status === "catalogue_unsupported") {
          await store.clear();
          if (cancelled) return;
          setPendingIntent(null);
          setFailure({
            catalogueMealId: pendingIntent.catalogueMealId,
            reason: "catalogue_unsupported",
          });
          return;
        }

        setConfirmedMealIds((current) =>
          new Set(current).add(pendingIntent.catalogueMealId),
        );
        await store.clear();
        setPendingIntent(null);
      })
      .catch(() => {
        if (!cancelled) {
          setFailure({
            catalogueMealId: pendingIntent.catalogueMealId,
            reason: "unexpected",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    isHydrated,
    pendingIntent,
    saveCatalogueMeal,
    savedMealIds,
    store,
  ]);

  const requestSave = useCallback(
    async (catalogueMealId: string) => {
      const intent = createCatalogueSaveIntent({
        catalogueMealId,
        catalogueVersion,
        now: Date.now(),
      });

      setFailure(null);
      try {
        await store.write(intent);
      } catch {
        setFailure({ catalogueMealId, reason: "storage" });
        return;
      }

      attemptedIntent.current = null;
      setPendingIntent(intent);

      if (userId === null) clerk.openSignIn();
    },
    [catalogueVersion, clerk, store, userId],
  );

  const combinedSavedMealIds = useMemo(
    () => new Set([...(savedMealIds ?? []), ...confirmedMealIds]),
    [confirmedMealIds, savedMealIds],
  );
  const value = useMemo<CatalogueSaveState>(
    () => ({
      isLoading:
        !isHydrated ||
        isAuthLoading ||
        (isAuthenticated && savedMealIds === undefined),
      isSignedIn: userId !== null,
      savedMealIds: combinedSavedMealIds,
      pendingMealId: pendingIntent?.catalogueMealId ?? null,
      failure,
      requestSave,
    }),
    [
      combinedSavedMealIds,
      failure,
      isAuthLoading,
      isAuthenticated,
      isHydrated,
      pendingIntent,
      requestSave,
      savedMealIds,
      userId,
    ],
  );

  return (
    <CatalogueSaveStateContext.Provider value={value}>
      {children}
    </CatalogueSaveStateContext.Provider>
  );
}

export function useCatalogueSaveState() {
  return useContext(CatalogueSaveStateContext);
}
